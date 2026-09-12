/**
 * Minimal RIFF/WAVE reader and writer.
 *
 * Everything that leaves a DSP stage in Sondra is planar Float32 channel data;
 * WAV is the lossless hand-off format between stages and to `ffmpeg.wasm`,
 * because it encodes and decodes in microseconds with no extra WASM payload.
 */

export type WavBitDepth = 16 | 24 | 32

/**
 * Channel data always backed by a plain ArrayBuffer rather than a
 * SharedArrayBuffer, because every buffer here is eventually handed to a worker
 * in a transfer list — and only the former can be transferred.
 */
export type Samples = Float32Array<ArrayBuffer>

export interface AudioData {
  /** One channel per entry, each `length` frames long. */
  channels: Samples[]
  sampleRate: number
}

/**
 * Encodes planar float channels into a WAV file.
 * 32-bit writes IEEE float (format 3); 16/24-bit write signed PCM (format 1).
 */
export function encodeWav(audio: AudioData, bitDepth: WavBitDepth = 32): Uint8Array<ArrayBuffer> {
  const channels = audio.channels
  const numChannels = channels.length
  if (numChannels === 0) throw new Error('encodeWav: no channels')
  const frames = channels[0].length
  const bytesPerSample = bitDepth / 8
  const blockAlign = numChannels * bytesPerSample
  const dataBytes = frames * blockAlign
  const isFloat = bitDepth === 32

  const buffer = new ArrayBuffer(44 + dataBytes)
  const view = new DataView(buffer)

  const ascii = (offset: number, text: string) => {
    for (let i = 0; i < text.length; i += 1) view.setUint8(offset + i, text.charCodeAt(i))
  }

  ascii(0, 'RIFF')
  view.setUint32(4, 36 + dataBytes, true)
  ascii(8, 'WAVE')
  ascii(12, 'fmt ')
  view.setUint32(16, 16, true) // PCM fmt chunk size
  view.setUint16(20, isFloat ? 3 : 1, true)
  view.setUint16(22, numChannels, true)
  view.setUint32(24, audio.sampleRate, true)
  view.setUint32(28, audio.sampleRate * blockAlign, true)
  view.setUint16(32, blockAlign, true)
  view.setUint16(34, bitDepth, true)
  ascii(36, 'data')
  view.setUint32(40, dataBytes, true)

  let offset = 44
  if (isFloat) {
    for (let i = 0; i < frames; i += 1) {
      for (let c = 0; c < numChannels; c += 1) {
        view.setFloat32(offset, channels[c][i], true)
        offset += 4
      }
    }
  } else if (bitDepth === 16) {
    for (let i = 0; i < frames; i += 1) {
      for (let c = 0; c < numChannels; c += 1) {
        const s = Math.max(-1, Math.min(1, channels[c][i]))
        view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true)
        offset += 2
      }
    }
  } else {
    for (let i = 0; i < frames; i += 1) {
      for (let c = 0; c < numChannels; c += 1) {
        const s = Math.max(-1, Math.min(1, channels[c][i]))
        const v = Math.round(s < 0 ? s * 0x800000 : s * 0x7fffff)
        view.setUint8(offset, v & 0xff)
        view.setUint8(offset + 1, (v >> 8) & 0xff)
        view.setUint8(offset + 2, (v >> 16) & 0xff)
        offset += 3
      }
    }
  }

  return new Uint8Array(buffer)
}

/**
 * Decodes a WAV file into planar floats.
 *
 * Handles PCM 8/16/24/32, IEEE float 32/64 and WAVE_FORMAT_EXTENSIBLE, and
 * walks the chunk list rather than assuming a canonical 44-byte header — real
 * encoders sprinkle LIST/fact chunks before `data`.
 */
export function decodeWav(bytes: Uint8Array): AudioData {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const tag = (offset: number) =>
    String.fromCharCode(view.getUint8(offset), view.getUint8(offset + 1), view.getUint8(offset + 2), view.getUint8(offset + 3))

  if (tag(0) !== 'RIFF' || tag(8) !== 'WAVE') throw new Error('Keine gültige WAV-Datei')

  let format = 1
  let numChannels = 0
  let sampleRate = 0
  let bitDepth = 0
  let dataOffset = -1
  let dataLength = 0

  let cursor = 12
  while (cursor + 8 <= view.byteLength) {
    const id = tag(cursor)
    const size = view.getUint32(cursor + 4, true)
    const body = cursor + 8
    if (id === 'fmt ') {
      format = view.getUint16(body, true)
      numChannels = view.getUint16(body + 2, true)
      sampleRate = view.getUint32(body + 4, true)
      bitDepth = view.getUint16(body + 14, true)
      // WAVE_FORMAT_EXTENSIBLE hides the real format in the sub-format GUID.
      if (format === 0xfffe && size >= 40) format = view.getUint16(body + 24, true)
    } else if (id === 'data') {
      dataOffset = body
      dataLength = Math.min(size, view.byteLength - body)
    }
    cursor = body + size + (size % 2) // chunks are word-aligned
  }

  if (dataOffset < 0 || !numChannels || !sampleRate) throw new Error('WAV-Datei ohne lesbare Audiodaten')

  const bytesPerSample = bitDepth / 8
  const frames = Math.floor(dataLength / (bytesPerSample * numChannels))
  const channels = Array.from({ length: numChannels }, () => new Float32Array(frames))

  for (let i = 0; i < frames; i += 1) {
    for (let c = 0; c < numChannels; c += 1) {
      const at = dataOffset + (i * numChannels + c) * bytesPerSample
      let value = 0
      if (format === 3) {
        value = bitDepth === 64 ? view.getFloat64(at, true) : view.getFloat32(at, true)
      } else if (bitDepth === 16) {
        value = view.getInt16(at, true) / 0x8000
      } else if (bitDepth === 24) {
        const raw = view.getUint8(at) | (view.getUint8(at + 1) << 8) | (view.getUint8(at + 2) << 16)
        value = (raw & 0x800000 ? raw - 0x1000000 : raw) / 0x800000
      } else if (bitDepth === 32) {
        value = view.getInt32(at, true) / 0x80000000
      } else if (bitDepth === 8) {
        value = (view.getUint8(at) - 128) / 128
      }
      channels[c][i] = value
    }
  }

  return { channels, sampleRate }
}

/** Sums every channel down to one, at equal weight. */
export function mixToMono(audio: AudioData): AudioData {
  if (audio.channels.length === 1) return audio
  const frames = audio.channels[0].length
  const mono = new Float32Array(frames)
  for (const channel of audio.channels) {
    for (let i = 0; i < frames; i += 1) mono[i] += channel[i] / audio.channels.length
  }
  return { channels: [mono], sampleRate: audio.sampleRate }
}

/** Copies an `AudioBuffer` out of the Web Audio graph into planar floats. */
export function fromAudioBuffer(buffer: AudioBuffer): AudioData {
  const channels: Samples[] = []
  for (let c = 0; c < buffer.numberOfChannels; c += 1) {
    channels.push(new Float32Array(buffer.getChannelData(c)))
  }
  return { channels, sampleRate: buffer.sampleRate }
}
