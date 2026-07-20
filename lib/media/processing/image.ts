import 'server-only'

import { createHash } from 'node:crypto'

import { parse } from 'exifr'
import sharp from 'sharp'

export const RENDITION_PROFILE_WIDTHS = [640, 1024, 1600, 2560] as const
export const RENDITION_JPEG_QUALITY = 90

const MAX_IMAGE_PIXELS = 100_000_000
const acceptedFormats = new Set(['heif', 'jpeg', 'png'])
const pngSignature = Buffer.from('89504e470d0a1a0a', 'hex')
const exifFields = [
  'Make',
  'Model',
  'Orientation',
  'DateTimeOriginal',
  'LensModel',
  'Lens',
  'FocalLength',
  'FNumber',
  'ExposureTime',
  'ISO',
  'ISOSpeedRatings',
  'GPSLatitude',
  'GPSLatitudeRef',
  'GPSLongitude',
  'GPSLongitudeRef',
  'latitude',
  'longitude',
] as const

export type MediaImageErrorCode =
  | 'animated'
  | 'invalid_image'
  | 'invalid_metadata'
  | 'pixel_limit'
  | 'unsupported_format'

export class MediaImageError extends Error {
  constructor(readonly code: MediaImageErrorCode) {
    super(`Media image processing failed: ${code}`)
    this.name = 'MediaImageError'
  }
}

type OwnedExif = Partial<Record<(typeof exifFields)[number], unknown>>

function imageBuffer(bytes: Uint8Array) {
  return Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength)
}

function cleanText(value: unknown) {
  if (typeof value !== 'string') return null
  const text = value.trim()
  return text ? text.slice(0, 255) : null
}

function positiveNumber(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
    ? value
    : null
}

function captureDate(value: unknown) {
  if (!(value instanceof Date) || !Number.isFinite(value.getTime())) return null
  return value
}

function captureLocation(metadata: OwnedExif) {
  const { latitude, longitude } = metadata
  if (
    typeof latitude !== 'number' ||
    !Number.isFinite(latitude) ||
    latitude < -90 ||
    latitude > 90 ||
    typeof longitude !== 'number' ||
    !Number.isFinite(longitude) ||
    longitude < -180 ||
    longitude > 180
  ) {
    return null
  }
  return {
    latitude: Math.round(latitude * 10_000_000) / 10_000_000,
    longitude: Math.round(longitude * 10_000_000) / 10_000_000,
  }
}

async function readOwnedExif(exif: Buffer | undefined) {
  if (!exif) return {}
  const tiff = exif.subarray(0, 6).equals(Buffer.from('Exif\0\0'))
    ? exif.subarray(6)
    : exif
  try {
    const metadata = (await parse(tiff, {
      pick: [...exifFields],
      gps: true,
      sanitize: true,
      mergeOutput: true,
      translateValues: false,
      makerNote: false,
      userComment: false,
      xmp: false,
      iptc: false,
      icc: false,
    })) as OwnedExif | undefined
    return metadata ?? {}
  } catch {
    throw new MediaImageError('invalid_metadata')
  }
}

function mapSharpError(error: unknown): MediaImageError {
  const message = error instanceof Error ? error.message.toLowerCase() : ''
  return new MediaImageError(
    message.includes('pixel limit') ? 'pixel_limit' : 'invalid_image',
  )
}

function isAnimatedPng(input: Buffer) {
  if (
    input.length < pngSignature.length ||
    !input.subarray(0, 8).equals(pngSignature)
  ) {
    return false
  }

  let offset = pngSignature.length
  while (offset + 12 <= input.length) {
    const length = input.readUInt32BE(offset)
    const dataStart = offset + 8
    const chunkEnd = dataStart + length + 4
    if (chunkEnd > input.length) return false

    const type = input.toString('ascii', offset + 4, dataStart)
    if (type === 'acTL' && length === 8) {
      return input.readUInt32BE(dataStart) > 1
    }
    if (type === 'IEND') return false
    offset = chunkEnd
  }

  return false
}

function orientation(metadata: OwnedExif) {
  const value = metadata.Orientation
  return typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 8
    ? value
    : 1
}

function applyOrientation(pipeline: ReturnType<typeof sharp>, value: number) {
  if (value === 2) return pipeline.flop()
  if (value === 3) return pipeline.rotate(180)
  if (value === 4) return pipeline.flip()
  if (value === 5) return pipeline.rotate(90).flop()
  if (value === 6) return pipeline.rotate(90)
  if (value === 7) return pipeline.rotate(90).flip()
  if (value === 8) return pipeline.rotate(270)
  return pipeline
}

async function heifPipeline(input: Buffer, value: number) {
  const { default: decodeHeic } = await import('heic-decode')
  const decoded = await decodeHeic({ buffer: input })
  if (
    !Number.isSafeInteger(decoded.width) ||
    !Number.isSafeInteger(decoded.height) ||
    decoded.width <= 0 ||
    decoded.height <= 0
  ) {
    throw new MediaImageError('invalid_image')
  }
  const decodedPixels = decoded.width * decoded.height
  if (!Number.isSafeInteger(decodedPixels) || decodedPixels > MAX_IMAGE_PIXELS) {
    throw new MediaImageError('pixel_limit')
  }
  if (decoded.data.byteLength !== decodedPixels * 4) {
    throw new MediaImageError('invalid_image')
  }
  return applyOrientation(
    sharp(decoded.data, {
      failOn: 'error',
      limitInputPixels: MAX_IMAGE_PIXELS,
      raw: { width: decoded.width, height: decoded.height, channels: 4 },
    }),
    value,
  )
}

export async function processOriginalImage(bytes: Uint8Array) {
  const input = imageBuffer(bytes)
  let source: Awaited<ReturnType<ReturnType<typeof sharp>['metadata']>>
  try {
    source = await sharp(input, {
      failOn: 'error',
      limitInputPixels: MAX_IMAGE_PIXELS,
    }).metadata()
  } catch (error) {
    throw mapSharpError(error)
  }

  if (!source.format || !acceptedFormats.has(source.format)) {
    throw new MediaImageError('unsupported_format')
  }
  if (source.format === 'heif' && source.compression !== 'hevc') {
    throw new MediaImageError('unsupported_format')
  }
  if (
    (source.pages ?? 1) !== 1 ||
    (source.format === 'png' && isAnimatedPng(input))
  ) {
    throw new MediaImageError('animated')
  }

  const metadata = await readOwnedExif(source.exif)
  const exifOrientation = orientation(metadata)
  const orientationSwapsDimensions = exifOrientation >= 5 && exifOrientation <= 8
  const orientedWidth =
    source.format === 'heif'
      ? orientationSwapsDimensions
        ? source.height
        : source.width
      : (source.autoOrient?.width ?? source.width)
  const orientedHeight =
    source.format === 'heif'
      ? orientationSwapsDimensions
        ? source.width
        : source.height
      : (source.autoOrient?.height ?? source.height)
  if (!orientedWidth || !orientedHeight) {
    throw new MediaImageError('invalid_image')
  }
  if (orientedWidth * orientedHeight > MAX_IMAGE_PIXELS) {
    throw new MediaImageError('pixel_limit')
  }

  let renditions
  try {
    const pipeline = (
      source.format === 'heif'
        ? await heifPipeline(input, exifOrientation)
        : sharp(input, {
            failOn: 'error',
            limitInputPixels: MAX_IMAGE_PIXELS,
          }).autoOrient()
    ).toColourspace('srgb')

    renditions = await Promise.all(
      RENDITION_PROFILE_WIDTHS.map(async (profileWidth) => {
        const { data, info } = await pipeline
          .clone()
          .resize({ width: profileWidth, fit: 'inside', withoutEnlargement: true })
          .jpeg({
            quality: RENDITION_JPEG_QUALITY,
            progressive: true,
            chromaSubsampling: '4:4:4',
          })
          .toBuffer({ resolveWithObject: true })
        return {
          profileWidth,
          bytes: new Uint8Array(data),
          checksumSha256: createHash('sha256').update(data).digest('hex'),
          byteSize: info.size,
          width: info.width,
          height: info.height,
          contentType: 'image/jpeg' as const,
          colorSpace: 'srgb' as const,
          progressive: true as const,
          metadataStripped: true as const,
        }
      }),
    )
  } catch (error) {
    if (error instanceof MediaImageError) throw error
    throw mapSharpError(error)
  }

  return {
    original: {
      format: source.format as 'heif' | 'jpeg' | 'png',
      width: orientedWidth,
      height: orientedHeight,
      capturedAt: captureDate(metadata.DateTimeOriginal),
      cameraMake: cleanText(metadata.Make),
      cameraModel: cleanText(metadata.Model),
      lens: cleanText(metadata.LensModel) ?? cleanText(metadata.Lens),
      focalLengthMillimeters: positiveNumber(metadata.FocalLength),
      aperture: positiveNumber(metadata.FNumber),
      shutterSpeedSeconds: positiveNumber(metadata.ExposureTime),
      iso:
        positiveNumber(metadata.ISO) ?? positiveNumber(metadata.ISOSpeedRatings),
      captureLocation: captureLocation(metadata),
    },
    renditions,
  }
}
