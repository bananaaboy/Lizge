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

/** The size the result will have, without doing the work. */
export function outputSize(bitmap: ImageBitmap, ops: ImageOps): { width: number; height: number } {
  const crop = ops.crop
  let width = crop ? Math.max(1, Math.round(bitmap.width * crop.width)) : bitmap.width
  let height = crop ? Math.max(1, Math.round(bitmap.height * crop.height)) : bitmap.height
  if (ops.rotate === 90 || ops.rotate === 270) [width, height] = [height, width]
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
 * Runs the whole chain in one draw where possible.
 *
 * Order matters and is fixed: crop, then rotate and flip, then scale, then
 * colour. Scaling last would throw away detail the crop was meant to keep;
 * colour first would be applied to pixels that are about to be resampled.
 */
export async function processImage(
  bitmap: ImageBitmap,
  ops: ImageOps,
): Promise<{ bytes: Uint8Array; mime: string; width: number; height: number }> {
  const crop = ops.crop
  const sourceX = crop ? crop.x * bitmap.width : 0
  const sourceY = crop ? crop.y * bitmap.height : 0
  const sourceWidth = crop ? Math.max(1, crop.width * bitmap.width) : bitmap.width
  const sourceHeight = crop ? Math.max(1, crop.height * bitmap.height) : bitmap.height

  const { width, height } = outputSize(bitmap, ops)
  const canvas = canvasOf(width, height)
  const context = canvas.getContext('2d')
  if (!context) throw new Error('Der Browser stellt keine Zeichenfläche bereit.')

  // JPEG has no transparency; without this a PNG with an alpha channel turns
  // black rather than white where it was see-through.
  if (ops.format === 'jpeg') {
    context.fillStyle = '#ffffff'
    context.fillRect(0, 0, width, height)
  }

  const filters: string[] = []
  if (ops.brightness !== 1) filters.push(`brightness(${ops.brightness})`)
  if (ops.contrast !== 1) filters.push(`contrast(${ops.contrast})`)
  if (ops.saturation !== 1) filters.push(`saturate(${ops.saturation})`)
  if (ops.blur > 0) filters.push(`blur(${ops.blur}px)`)
  if (filters.length > 0) context.filter = filters.join(' ')

  context.imageSmoothingEnabled = true
  context.imageSmoothingQuality = 'high'

  context.save()
  context.translate(width / 2, height / 2)
  if (ops.rotate) context.rotate((ops.rotate * Math.PI) / 180)
  context.scale(ops.flipH ? -1 : 1, ops.flipV ? -1 : 1)
  // After a quarter turn the destination box is the other way round.
  const drawWidth = ops.rotate === 90 || ops.rotate === 270 ? height : width
  const drawHeight = ops.rotate === 90 || ops.rotate === 270 ? width : height
  context.drawImage(
    bitmap,
    sourceX,
    sourceY,
    sourceWidth,
    sourceHeight,
    -drawWidth / 2,
    -drawHeight / 2,
    drawWidth,
    drawHeight,
  )
  context.restore()

  if (ops.sharpen > 0) {
    context.filter = 'none'
    context.putImageData(sharpen(context.getImageData(0, 0, width, height), ops.sharpen), 0, 0)
  }

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
