/**
 * Image processing, on the canvas that is already in every browser.
 *
 * FFmpeg could do all of this too, but it would mean waiting for a 30 MB
 * WebAssembly core before resizing a screenshot. The canvas decodes, scales,
 * rotates and re-encodes PNG, JPEG and WebP natively and instantly, and its
 * `filter` property is a real implementation of the colour operations rather
 * than an approximation. So images take the short route.
 *
 * What the canvas cannot do is write AVIF or TIFF. Those are read fine — the
 * browser decodes them — but they come back out as one of the three formats
 * above, and the panel says so rather than offering a choice that silently
 * produces a PNG.
 */

export type ImageFormat = 'png' | 'jpeg' | 'webp'

export const IMAGE_FORMATS: { id: ImageFormat; label: string; mime: string; hint: string; lossy: boolean }[] = [
  { id: 'webp', label: 'WebP', mime: 'image/webp', hint: 'Kleinste Dateien, überall modern unterstützt', lossy: true },
  { id: 'jpeg', label: 'JPEG', mime: 'image/jpeg', hint: 'Fotos, von wirklich allem lesbar', lossy: true },
  { id: 'png', label: 'PNG', mime: 'image/png', hint: 'Verlustfrei, kann Transparenz', lossy: false },
]

export interface CropRect {
  /** Fractions of the source, 0–1, so a crop survives a resize. */
  x: number
  y: number
  width: number
  height: number
}

export interface ImageOps {
  /** Target width in pixels. 0 keeps the original. */
  width: number
  crop: CropRect | null
  rotate: 0 | 90 | 180 | 270
  flipH: boolean
  flipV: boolean
  /** 1 is unchanged for all three. */
  brightness: number
  contrast: number
  saturation: number
  /** Pixels of gaussian blur. */
  blur: number
  /** 0–1; a 3×3 unsharp pass. */
  sharpen: number
  format: ImageFormat
  /** 0–1, ignored by PNG. */
  quality: number
}

export const DEFAULT_IMAGE_OPS: ImageOps = {
  width: 0,
  crop: null,
  rotate: 0,
  flipH: false,
  flipV: false,
  brightness: 1,
  contrast: 1,
  saturation: 1,
  blur: 0,
  sharpen: 0,
  format: 'webp',
  quality: 0.85,
}

export interface ImageFacts {
  width: number
  height: number
  /** Megapixels, for the "is this going to be slow" question. */
  megapixels: number
}

/** Decodes bytes into something drawable, or explains why not. */
export async function readImage(bytes: Uint8Array, mime: string): Promise<ImageBitmap> {
  const view = bytes.slice()
  const blob = new Blob([view.buffer as ArrayBuffer], { type: mime || 'image/*' })
  try {
    return await createImageBitmap(blob)
  } catch {
    throw new Error(
      'Dieses Bild lässt sich hier nicht öffnen. Der Browser bringt Decoder für JPEG, PNG, WebP, ' +
        'GIF und meist AVIF mit — bei TIFF, HEIC oder SVG hängt es von Browser und Betriebssystem ab.',
    )
  }
}

export function factsOf(bitmap: ImageBitmap): ImageFacts {
  return {
    width: bitmap.width,
    height: bitmap.height,
    megapixels: (bitmap.width * bitmap.height) / 1e6,
  }
}

/**
 * The frame the crop rectangle lives in.
 *
 * Rotation happens before cropping — you straighten a photo and *then* decide
 * what to keep, not the other way round — so after a quarter turn the frame is
 * the other way round too, and a crop rectangle expressed against it has to
 * follow. Every part of the pipeline asks this function rather than working it
 * out again, which is what keeps the overlay on screen and the pixels in the
 * file agreeing with each other.
 */
export function rotatedSize(bitmap: { width: number; height: number }, rotate: number): {
  width: number
  height: number
} {
  return rotate === 90 || rotate === 270
    ? { width: bitmap.height, height: bitmap.width }
    : { width: bitmap.width, height: bitmap.height }
}

/** The size the result will have, without doing the work. */
export function outputSize(bitmap: ImageBitmap, ops: ImageOps): { width: number; height: number } {
  const frame = rotatedSize(bitmap, ops.rotate)
  const crop = ops.crop
  let width = crop ? Math.max(1, Math.round(frame.width * crop.width)) : frame.width
  let height = crop ? Math.max(1, Math.round(frame.height * crop.height)) : frame.height
  if (ops.width > 0 && ops.width !== width) {
    height = Math.max(1, Math.round((height * ops.width) / width))
    width = ops.width
  }
  return { width, height }
}

/**
 * A 3×3 unsharp pass.
 *
 * The canvas filter has no sharpen, and the usual trick — blur the copy,
 * subtract it — costs a second full-size draw. At 3×3 the kernel is small
 * enough to run straight over the pixel buffer, and `amount` scales between
 * the original and the fully sharpened version so the slider has a usable
 * range instead of jumping from nothing to crunchy.
 */
function sharpen(data: ImageData, amount: number): ImageData {
  if (amount <= 0) return data
  const { width, height } = data
  const source = data.data
  const target = new Uint8ClampedArray(source)
  const centre = 1 + 4 * amount
  const side = -amount

  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const at = (y * width + x) * 4
      for (let channel = 0; channel < 3; channel += 1) {
        const i = at + channel
        const value =
          source[i] * centre +
          source[i - 4] * side +
          source[i + 4] * side +
          source[i - width * 4] * side +
          source[i + width * 4] * side
        target[i] = value
      }
    }
  }
  return new ImageData(target, width, height)
}

function canvasOf(width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  return canvas
}

/**
 * Turns the image the right way up, once.
 *
 * Only called when there is a turn or a mirror to apply; without one the
 * original bitmap is handed straight to the crop, which saves a full-size draw
 * on the common path.
 */
function orient(bitmap: ImageBitmap, ops: ImageOps): CanvasImageSource {
  const frame = rotatedSize(bitmap, ops.rotate)
  const canvas = canvasOf(frame.width, frame.height)
  const context = canvas.getContext('2d')
  if (!context) throw new Error('Der Browser stellt keine Zeichenfläche bereit.')
  context.imageSmoothingQuality = 'high'
  // The mirror is applied to what you end up seeing, not to the unrotated
  // source: canvas composes these right-to-left, so `scale` written before
  // `rotate` is the one that happens after it. "Horizontal spiegeln" on a
  // photo you have just turned upright should mirror it left-to-right on
  // screen, not top-to-bottom.
  context.translate(frame.width / 2, frame.height / 2)
  context.scale(ops.flipH ? -1 : 1, ops.flipV ? -1 : 1)
  if (ops.rotate) context.rotate((ops.rotate * Math.PI) / 180)
  context.drawImage(bitmap, -bitmap.width / 2, -bitmap.height / 2)
  return canvas
}

/**
 * Draws the whole chain onto a canvas.
 *
 * Order is fixed: orient, then crop, then scale, then colour. The preview and
 * the export call exactly this, which is the point — a preview computed by a
 * second, similar-looking code path is a preview that will eventually lie.
 *
 * `maxDimension` is the one thing the preview asks for differently: at 24
 * megapixels a live redraw on every slider tick is not free, and nobody can
 * see 24 megapixels on a 700-pixel stage anyway. Blur scales with it so the
 * preview still shows the right amount of blur; sharpen is a 3×3 kernel and is
 * therefore always slightly stronger in the preview than in the export, which
 * is the honest trade for making it interactive at all.
 */
export function paintImage(
  bitmap: ImageBitmap,
  ops: ImageOps,
  canvas: HTMLCanvasElement,
  maxDimension = 0,
): { width: number; height: number; scale: number } {
  const full = outputSize(bitmap, ops)
  const scale =
    maxDimension > 0 && Math.max(full.width, full.height) > maxDimension
      ? maxDimension / Math.max(full.width, full.height)
      : 1
  const width = Math.max(1, Math.round(full.width * scale))
  const height = Math.max(1, Math.round(full.height * scale))

  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d')
  if (!context) throw new Error('Der Browser stellt keine Zeichenfläche bereit.')

  // JPEG has no transparency; without this a PNG with an alpha channel turns
  // black rather than white where it was see-through.
  if (ops.format === 'jpeg') {
    context.fillStyle = '#ffffff'
    context.fillRect(0, 0, width, height)
  }

  const source = ops.rotate || ops.flipH || ops.flipV ? orient(bitmap, ops) : bitmap
  const frame = rotatedSize(bitmap, ops.rotate)
  const crop = ops.crop
  const sourceX = crop ? crop.x * frame.width : 0
  const sourceY = crop ? crop.y * frame.height : 0
  const sourceWidth = crop ? Math.max(1, crop.width * frame.width) : frame.width
  const sourceHeight = crop ? Math.max(1, crop.height * frame.height) : frame.height

  const filters: string[] = []
  if (ops.brightness !== 1) filters.push(`brightness(${ops.brightness})`)
  if (ops.contrast !== 1) filters.push(`contrast(${ops.contrast})`)
  if (ops.saturation !== 1) filters.push(`saturate(${ops.saturation})`)
  if (ops.blur > 0) filters.push(`blur(${(ops.blur * scale).toFixed(2)}px)`)
  context.filter = filters.length > 0 ? filters.join(' ') : 'none'

  context.imageSmoothingEnabled = true
  context.imageSmoothingQuality = 'high'
  context.drawImage(source, sourceX, sourceY, sourceWidth, sourceHeight, 0, 0, width, height)

  if (ops.sharpen > 0) {
    context.filter = 'none'
    context.putImageData(sharpen(context.getImageData(0, 0, width, height), ops.sharpen), 0, 0)
  }

  return { width, height, scale }
}

/** Runs the chain and encodes the result. */
export async function processImage(
  bitmap: ImageBitmap,
  ops: ImageOps,
): Promise<{ bytes: Uint8Array; mime: string; width: number; height: number }> {
  const canvas = document.createElement('canvas')
  const { width, height } = paintImage(bitmap, ops, canvas)

  const format = IMAGE_FORMATS.find((entry) => entry.id === ops.format) ?? IMAGE_FORMATS[0]
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, format.mime, format.lossy ? ops.quality : undefined),
  )
  if (!blob) throw new Error(`${format.label} konnte nicht geschrieben werden.`)
  // A browser that cannot write the format falls back to PNG silently, so the
  // result is asked what it actually is rather than what was requested.
  const actual = blob.type || format.mime
  return { bytes: new Uint8Array(await blob.arrayBuffer()), mime: actual, width, height }
}

/** The extension that matches what really came out. */
export function extensionFor(mime: string): string {
  if (mime.includes('webp')) return 'webp'
  if (mime.includes('jpeg')) return 'jpg'
  return 'png'
}
