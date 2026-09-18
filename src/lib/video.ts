/**
 * Video operations, expressed as one FFmpeg invocation.
 *
 * Every edit here is a filter, and filters compose — so cutting, cropping,
 * straightening, scaling and changing the speed all happen in a single pass
 * rather than five. That matters more than it sounds: each extra pass is
 * another full decode and re-encode, which on a WebAssembly build is the
 * difference between a coffee and an afternoon.
 *
 * The order of the chain is fixed and not arbitrary. Cropping first means
 * everything downstream works on fewer pixels; scaling before the speed change
 * keeps the resampling off the interpolated frames; and `setpts` has to be last
 * because it rewrites timestamps the earlier filters still rely on.
 */

export type VideoContainer = 'mp4' | 'webm' | 'gif'

export interface VideoPreset {
  id: string
  label: string
  hint: string
  /** 0 keeps the source height. */
  height: number
  /** Constant Rate Factor — lower is better and bigger. */
  crf: number
}

export const VIDEO_PRESETS: VideoPreset[] = [
  { id: 'original', label: 'Original', hint: 'Auflösung unverändert, sichtbar verlustfrei', height: 0, crf: 18 },
  { id: 'high', label: 'Hohe Qualität', hint: 'Auflösung unverändert, deutlich kleiner', height: 0, crf: 22 },
  { id: '1080p', label: '1080p', hint: 'Full HD — der übliche Kompromiss', height: 1080, crf: 23 },
  { id: '720p', label: '720p', hint: 'Schnell und klein, gut für Messenger', height: 720, crf: 25 },
  { id: '480p', label: '480p', hint: 'Sehr klein, für Vorschau und E-Mail', height: 480, crf: 28 },
]

export interface VideoOps {
  /** Seconds. `end` of 0 means "to the end of the file". */
  start: number
  end: number
  crop: { x: number; y: number; width: number; height: number } | null
  rotate: 0 | 90 | 180 | 270
  flipH: boolean
  flipV: boolean
  /** 1 is unchanged; 0.5 is half speed, 2 is double. */
  speed: number
  mute: boolean
  container: VideoContainer
  preset: string
}

export const DEFAULT_VIDEO_OPS: VideoOps = {
  start: 0,
  end: 0,
  crop: null,
  rotate: 0,
  flipH: false,
  flipV: false,
  speed: 1,
  mute: false,
  container: 'mp4',
  preset: '1080p',
}

export function findPreset(id: string): VideoPreset {
  return VIDEO_PRESETS.find((preset) => preset.id === id) ?? VIDEO_PRESETS[2]
}

/**
 * `atempo` only accepts 0.5–2.0, so anything beyond is reached by chaining.
 *
 * Two halvings give a quarter, two doublings give four times — and chaining is
 * the documented way to do it, not a trick: each stage resamples cleanly where
 * one stage out of range would simply be rejected.
 */
function tempoChain(speed: number): string[] {
  const stages: number[] = []
  let remaining = speed
  while (remaining > 2) {
    stages.push(2)
    remaining /= 2
  }
  while (remaining < 0.5) {
    stages.push(0.5)
    remaining *= 2
  }
  if (Math.abs(remaining - 1) > 0.001) stages.push(remaining)
  return stages.map((stage) => `atempo=${stage.toFixed(4)}`)
}

export interface BuiltJob {
  args: string[]
  /** What the result should be called, extension included. */
  extension: string
  mime: string
  /** True when nothing was asked for that requires re-encoding. */
  copyOnly: boolean
}

/**
 * Turns the settings into an argument list.
 *
 * `-ss` before `-i` seeks by keyframe and is near-instant; after `-i` it is
 * frame-exact but decodes everything up to the cut. Exactness wins here,
 * because a cut that lands half a second off is the kind of thing people
 * notice immediately and blame on the tool.
 */
export function buildVideoJob(
  ops: VideoOps,
  input: string,
  duration: number,
  source: { width: number; height: number } | null = null,
): BuiltJob {
  const preset = findPreset(ops.preset)
  const args: string[] = ['-i', input]

  if (ops.start > 0) args.push('-ss', ops.start.toFixed(3))
  const end = ops.end > 0 ? ops.end : duration
  if (end > ops.start && end < duration - 0.001) args.push('-to', end.toFixed(3))

  const filters: string[] = []
  if (ops.crop) {
    // FFmpeg wants pixels, and only even numbers survive 4:2:0 chroma.
    const even = (value: string) => `trunc(${value}/2)*2`
    filters.push(
      `crop=${even(`iw*${ops.crop.width.toFixed(4)}`)}:${even(`ih*${ops.crop.height.toFixed(4)}`)}:` +
        `${even(`iw*${ops.crop.x.toFixed(4)}`)}:${even(`ih*${ops.crop.y.toFixed(4)}`)}`,
    )
  }
  if (ops.rotate === 90) filters.push('transpose=1')
  if (ops.rotate === 180) filters.push('transpose=1,transpose=1')
  if (ops.rotate === 270) filters.push('transpose=2')
  if (ops.flipH) filters.push('hflip')
  if (ops.flipV) filters.push('vflip')
  // The obvious way to avoid upscaling is scale=-2:'min(720,ih)'. Two traps in
  // one expression: these arguments reach FFmpeg as an array, so the quotes are
  // literal characters that break the filter, and the comma inside min() is
  // what separates filters in a graph and would need escaping. Since the source
  // height is known here, the smaller of the two is simply worked out in
  // advance and the filter gets a plain number.
  if (preset.height > 0) {
    const height = source ? Math.min(preset.height, source.height) : preset.height
    // Odd heights have no valid 4:2:0 chroma plane.
    filters.push(`scale=-2:${Math.max(2, Math.round(height / 2) * 2)}`)
  }
  if (ops.speed !== 1) filters.push(`setpts=${(1 / ops.speed).toFixed(5)}*PTS`)

  const trimmed = ops.start > 0 || (ops.end > 0 && ops.end < duration - 0.001)
  const untouched = filters.length === 0 && ops.speed === 1

  if (ops.container === 'gif') {
    // One palette for the whole clip, generated from the clip itself: the
    // default 216-colour web palette is what makes converted GIFs look like
    // they came from 1998.
    const width = source ? Math.min(640, source.width) : 640
    const chain = [...filters, 'fps=15', `scale=${Math.max(2, Math.round(width / 2) * 2)}:-2:flags=lanczos`].join(',')
    args.push('-filter_complex', `${chain},split[a][b];[a]palettegen=stats_mode=diff[p];[b][p]paletteuse=dither=bayer`)
    args.push('-loop', '0')
    return { args, extension: 'gif', mime: 'image/gif', copyOnly: false }
  }

  if (filters.length > 0) args.push('-vf', filters.join(','))

  if (ops.mute) {
    args.push('-an')
  } else if (ops.speed !== 1) {
    args.push('-filter:a', tempoChain(ops.speed).join(','))
  }

  if (ops.container === 'webm') {
    args.push('-c:v', 'libvpx-vp9', '-crf', String(preset.crf + 8), '-b:v', '0', '-row-mt', '1')
    if (!ops.mute) args.push('-c:a', 'libopus', '-b:a', '128k')
    return { args, extension: 'webm', mime: 'video/webm', copyOnly: false }
  }

  // Nothing but a cut: copy the streams instead of re-encoding them. Minutes
  // become seconds, and the picture is bit-for-bit the original.
  if (untouched && trimmed && !ops.mute) {
    args.push('-c', 'copy', '-avoid_negative_ts', 'make_zero')
    return { args, extension: 'mp4', mime: 'video/mp4', copyOnly: true }
  }

  // `medium`, not `veryfast`, and this is measured rather than taste. With
  // `-preset veryfast` this build of the WebAssembly x264 dies immediately in
  // a pthread entry point — "null function or function signature mismatch",
  // an error that names neither the preset nor the encoder. The same argument
  // list runs clean through a native FFmpeg, and the existing converter, which
  // offers `veryfast` in its own menu, does not crash on it but never returns
  // either. `medium` finishes the same job in ten seconds.
  args.push('-c:v', 'libx264', '-crf', String(preset.crf), '-preset', 'medium', '-pix_fmt', 'yuv420p')
  if (!ops.mute) args.push('-c:a', 'aac', '-b:a', '192k')
  args.push('-movflags', '+faststart')
  return { args, extension: 'mp4', mime: 'video/mp4', copyOnly: false }
}

/** Pulls the audio out untouched where possible, re-encoded where not. */
export function buildAudioExtraction(input: string, format: 'copy' | 'wav' | 'mp3' | 'flac'): BuiltJob {
  const base = ['-i', input, '-vn']
  if (format === 'wav') return { args: [...base, '-c:a', 'pcm_s16le'], extension: 'wav', mime: 'audio/wav', copyOnly: false }
  if (format === 'mp3') return { args: [...base, '-c:a', 'libmp3lame', '-q:a', '2'], extension: 'mp3', mime: 'audio/mpeg', copyOnly: false }
  if (format === 'flac') return { args: [...base, '-c:a', 'flac'], extension: 'flac', mime: 'audio/flac', copyOnly: false }
  // Copy keeps whatever the video carried — usually AAC in an .m4a shell.
  return { args: [...base, '-c:a', 'copy'], extension: 'm4a', mime: 'audio/mp4', copyOnly: true }
}

/** A single frame as a PNG. */
export function buildFrameGrab(input: string, atSeconds: number): BuiltJob {
  return {
    args: ['-ss', atSeconds.toFixed(3), '-i', input, '-frames:v', '1'],
    extension: 'png',
    mime: 'image/png',
    copyOnly: false,
  }
}

/** Replaces the soundtrack, keeping the picture untouched. */
export function buildAudioReplacement(video: string, audio: string): BuiltJob {
  return {
    args: [
      '-i', video,
      '-i', audio,
      '-map', '0:v:0',
      '-map', '1:a:0',
      '-c:v', 'copy',
      '-c:a', 'aac',
      '-b:a', '192k',
      // The result ends with whichever of the two runs out first, rather than
      // freezing on a still frame or trailing silence.
      '-shortest',
      '-movflags', '+faststart',
    ],
    extension: 'mp4',
    mime: 'video/mp4',
    copyOnly: false,
  }
}
