import { createHash } from 'node:crypto'

import sharp from 'sharp'
import { describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

import {
  MediaImageError,
  processOriginalImage,
  RENDITION_JPEG_QUALITY,
  RENDITION_PROFILE_WIDTHS,
} from './image'

async function orientedPhoto() {
  return sharp({
    create: {
      width: 120,
      height: 80,
      channels: 3,
      background: '#d946ef',
    },
  })
    .withExif({
      IFD0: {
        Make: '  Cali Test Camera  ',
        Model: 'Pocket One',
      },
      IFD2: {
        DateTimeOriginal: '2025:05:08 00:31:34',
        LensModel: 'Prime 50',
        FNumber: '28/10',
        ExposureTime: '1/125',
        ISOSpeedRatings: '400',
        FocalLength: '50/1',
      },
      IFD3: {
        GPSLatitudeRef: 'N',
        GPSLatitude: '37/1 46/1 2964/100',
        GPSLongitudeRef: 'W',
        GPSLongitude: '122/1 25/1 984/100',
      },
    })
    .withMetadata({ orientation: 6 })
    .jpeg()
    .toBuffer()
}

describe('Media Library image processing', () => {
  it('auto-orients an Original and extracts only owned metadata', async () => {
    const result = await processOriginalImage(await orientedPhoto())

    expect(result.original).toMatchObject({
      format: 'jpeg',
      width: 80,
      height: 120,
      cameraMake: 'Cali Test Camera',
      cameraModel: 'Pocket One',
      lens: 'Prime 50',
      focalLengthMillimeters: 50,
      aperture: 2.8,
      shutterSpeedSeconds: 0.008,
      iso: 400,
      captureLocation: {
        latitude: 37.7749,
        longitude: -122.4194,
      },
    })
    expect(result.original.capturedAt).toBeInstanceOf(Date)
  })

  it('produces every no-upscale progressive JPEG Rendition without metadata', async () => {
    const result = await processOriginalImage(await orientedPhoto())

    expect(RENDITION_JPEG_QUALITY).toBe(90)
    expect(result.renditions.map((rendition) => rendition.profileWidth)).toEqual(
      RENDITION_PROFILE_WIDTHS,
    )
    for (const rendition of result.renditions) {
      expect(rendition).toMatchObject({
        contentType: 'image/jpeg',
        width: 80,
        height: 120,
        byteSize: rendition.bytes.byteLength,
        colorSpace: 'srgb',
        progressive: true,
        metadataStripped: true,
      })
      expect(rendition.checksumSha256).toBe(
        createHash('sha256').update(rendition.bytes).digest('hex'),
      )

      const publicMetadata = await sharp(rendition.bytes).metadata()
      expect(publicMetadata).toMatchObject({
        format: 'jpeg',
        width: 80,
        height: 120,
        space: 'srgb',
        isProgressive: true,
        chromaSubsampling: '4:4:4',
      })
      expect(publicMetadata.exif).toBeUndefined()
      expect(publicMetadata.xmp).toBeUndefined()
      expect(publicMetadata.iptc).toBeUndefined()
    }
  })

  it('rejects formats outside the Original allowlist', async () => {
    const svg = Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"/>',
    )

    await expect(processOriginalImage(svg)).rejects.toEqual(
      new MediaImageError('unsupported_format'),
    )
  })

  it('rejects an image header over the decoded pixel limit', async () => {
    const oversized = Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg" width="10001" height="10000"/>',
    )

    await expect(processOriginalImage(oversized)).rejects.toEqual(
      new MediaImageError('pixel_limit'),
    )
  })

  it('rejects bytes that cannot be decoded as an image', async () => {
    await expect(processOriginalImage(Buffer.from('not an image'))).rejects.toEqual(
      new MediaImageError('invalid_image'),
    )
  })

  it('rejects GIF Originals even when the decoder can read them', async () => {
    const animated = await sharp({
      create: {
        width: 4,
        height: 4,
        channels: 4,
        background: '#ffffff',
      },
    })
      .gif()
      .toBuffer()

    await expect(processOriginalImage(animated)).rejects.toEqual(
      new MediaImageError('unsupported_format'),
    )
  })

  it('accepts static PNG Originals', async () => {
    const png = await sharp({
      create: {
        width: 4,
        height: 4,
        channels: 4,
        background: '#ffffff',
      },
    })
      .png()
      .toBuffer()

    await expect(processOriginalImage(png)).resolves.toMatchObject({
      original: { format: 'png', width: 4, height: 4 },
    })
  })

  it(
    'rejects animated PNG Originals when the decoder reports one page',
    async () => {
      const animatedPng = Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAACGFjVEwAAAACAAAAAPONk3AAAAAaZmNUTAAAAAAAAAABAAAAAQAAAAAAAAAAAAEACgAAWn8w0AAAAA1JREFUeJxj+M/A8B8ABQAB/4mZPR0AAAAaZmNUTAAAAAEAAAABAAAAAQAAAAAAAAAAAAEACgAAwQzaBAAAABFmZEFUAAAAAnicY2Bg+P8fAAMCAf/1e6XXAAAAAElFTkSuQmCC',
        'base64',
      )
      expect((await sharp(animatedPng).metadata()).pages).toBeUndefined()

      await expect(processOriginalImage(animatedPng)).rejects.toEqual(
        new MediaImageError('animated'),
      )
    },
  )

  it('does not treat AVIF as an allowed HEIC Original', async () => {
    const avif = await sharp({
      create: {
        width: 4,
        height: 4,
        channels: 3,
        background: '#ffffff',
      },
    })
      .avif()
      .toBuffer()

    await expect(processOriginalImage(avif)).rejects.toEqual(
      new MediaImageError('unsupported_format'),
    )
  })
})
