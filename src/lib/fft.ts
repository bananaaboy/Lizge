/**
 * Iterative radix-2 FFT plus a short-time Fourier transform built on it.
 *
 * Written against plain Float32Arrays with pre-computed twiddle tables so it
 * can run inside a worker with no allocations in the hot loop. This is the
 * shared front end for stem separation — no external DSP dependency.
 */

import type { Samples } from './wav'

export class Fft {
  readonly size: number
  private readonly levels: number
  private readonly cos: Float64Array
  private readonly sin: Float64Array
  private readonly reverse: Uint32Array

  constructor(size: number) {
    if (size < 2 || (size & (size - 1)) !== 0) throw new Error('FFT-Größe muss eine Zweierpotenz sein')
    this.size = size
    this.levels = Math.log2(size) | 0

    const half = size / 2
    this.cos = new Float64Array(half)
    this.sin = new Float64Array(half)
    for (let i = 0; i < half; i += 1) {
      this.cos[i] = Math.cos((2 * Math.PI * i) / size)
      this.sin[i] = Math.sin((2 * Math.PI * i) / size)
    }

    // Bit-reversal permutation table.
    this.reverse = new Uint32Array(size)
    for (let i = 0; i < size; i += 1) {
      let x = i
      let r = 0
      for (let b = 0; b < this.levels; b += 1) {
        r = (r << 1) | (x & 1)
        x >>= 1
      }
      this.reverse[i] = r
    }
  }

  /** In-place complex FFT (decimation in time). */
  forward(real: Float64Array, imag: Float64Array): void {
    this.transform(real, imag)
  }

  /** In-place inverse FFT, scaled by 1/N so `inverse(forward(x)) === x`. */
  inverse(real: Float64Array, imag: Float64Array): void {
    // conj → forward → conj → scale
    this.transform(imag, real)
    const scale = 1 / this.size
    for (let i = 0; i < this.size; i += 1) {
      real[i] *= scale
      imag[i] *= scale
    }
  }

  private transform(real: Float64Array, imag: Float64Array): void {
    const n = this.size

    for (let i = 0; i < n; i += 1) {
      const j = this.reverse[i]
      if (j > i) {
        let t = real[i]
        real[i] = real[j]
        real[j] = t
        t = imag[i]
        imag[i] = imag[j]
        imag[j] = t
      }
    }

    for (let span = 2; span <= n; span *= 2) {
      const half = span / 2
      const step = n / span
      for (let i = 0; i < n; i += span) {
        for (let j = i, k = 0; j < i + half; j += 1, k += step) {
          const l = j + half
          const wr = this.cos[k]
          const wi = -this.sin[k]
          const tr = real[l] * wr - imag[l] * wi
          const ti = real[l] * wi + imag[l] * wr
          real[l] = real[j] - tr
          imag[l] = imag[j] - ti
          real[j] += tr
          imag[j] += ti
        }
      }
    }
  }
}

/** Periodic Hann window — the correct flavour for spectral analysis. */
export function hannWindow(size: number): Float64Array {
  const w = new Float64Array(size)
  for (let i = 0; i < size; i += 1) w[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / size)
  return w
}

/**
 * Square-root Hann. Applying it on analysis *and* synthesis gives exact
 * weighted-overlap-add reconstruction at 75 % overlap, which matters because
 * separation edits the spectrogram between the two halves.
 */
export function sqrtHannWindow(size: number): Float64Array {
  const hann = hannWindow(size)
  const w = new Float64Array(size)
  for (let i = 0; i < size; i += 1) w[i] = Math.sqrt(hann[i])
  return w
}

export interface Spectrogram {
  /** `frames × bins` real parts, frame-major. */
  real: Float32Array
  imag: Float32Array
  frames: number
  /** Non-redundant bin count, fftSize / 2 + 1. */
  bins: number
  fftSize: number
  hopSize: number
  /** Frames the signal was zero-padded with at the head, for exact undo. */
  padding: number
  length: number
}

/**
 * Forward STFT with centred frames (the signal is reflected at both edges so
 * that frame `t` is centred on sample `t * hop`).
 */
export function stft(signal: Float32Array, fftSize: number, hopSize: number): Spectrogram {
  const fft = new Fft(fftSize)
  const window = sqrtHannWindow(fftSize)
  const padding = fftSize / 2
  const frames = Math.max(1, Math.ceil(signal.length / hopSize) + 1)
  const bins = fftSize / 2 + 1

  const real = new Float32Array(frames * bins)
  const imag = new Float32Array(frames * bins)
  const re = new Float64Array(fftSize)
  const im = new Float64Array(fftSize)

  for (let f = 0; f < frames; f += 1) {
    const start = f * hopSize - padding
    im.fill(0)
    for (let i = 0; i < fftSize; i += 1) {
      const at = start + i
      // Reflect at the boundaries rather than zero-padding, which would
      // otherwise show up as a click in the reconstructed stem.
      let sample = 0
      if (at >= 0 && at < signal.length) sample = signal[at]
      else if (at < 0 && -at < signal.length) sample = signal[-at]
      else if (at >= signal.length) {
        const mirrored = 2 * signal.length - at - 2
        if (mirrored >= 0 && mirrored < signal.length) sample = signal[mirrored]
      }
      re[i] = sample * window[i]
    }
    fft.forward(re, im)
    const offset = f * bins
    for (let b = 0; b < bins; b += 1) {
      real[offset + b] = re[b]
      imag[offset + b] = im[b]
    }
  }

  return { real, imag, frames, bins, fftSize, hopSize, padding, length: signal.length }
}

/** Inverse STFT with weighted overlap-add and window-sum normalisation. */
export function istft(spec: Spectrogram): Samples {
  const { frames, bins, fftSize, hopSize, padding, length } = spec
  const fft = new Fft(fftSize)
  const window = sqrtHannWindow(fftSize)

  const output = new Float64Array(length + fftSize)
  const weight = new Float64Array(length + fftSize)
  const re = new Float64Array(fftSize)
  const im = new Float64Array(fftSize)

  for (let f = 0; f < frames; f += 1) {
    const offset = f * bins
    for (let b = 0; b < bins; b += 1) {
      re[b] = spec.real[offset + b]
      im[b] = spec.imag[offset + b]
    }
    // Rebuild the conjugate-symmetric upper half before inverting.
    for (let b = bins; b < fftSize; b += 1) {
      re[b] = spec.real[offset + (fftSize - b)]
      im[b] = -spec.imag[offset + (fftSize - b)]
    }
    fft.inverse(re, im)

    const start = f * hopSize - padding
    for (let i = 0; i < fftSize; i += 1) {
      const at = start + i
      if (at < 0 || at >= output.length) continue
      output[at] += re[i] * window[i]
      weight[at] += window[i] * window[i]
    }
  }

  const result = new Float32Array(length)
  for (let i = 0; i < length; i += 1) {
    result[i] = weight[i] > 1e-8 ? output[i] / weight[i] : 0
  }
  return result
}

/** Per-bin magnitude of a spectrogram, reused by every masking algorithm. */
export function magnitudeOf(spec: Spectrogram): Float32Array {
  const n = spec.frames * spec.bins
  const mag = new Float32Array(n)
  for (let i = 0; i < n; i += 1) mag[i] = Math.hypot(spec.real[i], spec.imag[i])
  return mag
}

/** Applies a real-valued mask to a spectrogram, returning a new one. */
export function applyMask(spec: Spectrogram, mask: Float32Array): Spectrogram {
  const n = spec.frames * spec.bins
  const real = new Float32Array(n)
  const imag = new Float32Array(n)
  for (let i = 0; i < n; i += 1) {
    real[i] = spec.real[i] * mask[i]
    imag[i] = spec.imag[i] * mask[i]
  }
  return { ...spec, real, imag }
}
