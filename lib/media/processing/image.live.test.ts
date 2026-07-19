import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'

import { describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

import { processOriginalImage } from './image'

const enabled = process.env.MEDIA_IMAGE_LIVE_TEST === 'confirmed-local'
const liveDescribe = enabled ? describe : describe.skip

liveDescribe('Media Library local image contract', () => {
  it.each([
    {
      path: process.env.MEDIA_IMAGE_LIVE_HEIC,
      checksum: '88a49da230bb852105ed25e9135cd076d2d515810767a57f79839c6933fe4f49',
      format: 'heif',
      width: 4032,
      height: 3024,
      renditions: [
        [640, 480],
        [1024, 768],
        [1600, 1200],
        [2560, 1920],
      ],
    },
    {
      path: process.env.MEDIA_IMAGE_LIVE_JPEG,
      checksum: '1825bebd811ee2ff341932b96967bd13a0102e1aec90a699af981eaec8991c51',
      format: 'jpeg',
      width: 1770,
      height: 2376,
      renditions: [
        [640, 859],
        [1024, 1375],
        [1600, 2148],
        [1770, 2376],
      ],
    },
  ])('processes the approved $format Original without changing it', async (fixture) => {
    expect(fixture.path).toBeTruthy()
    const bytes = await readFile(fixture.path!)
    const before = createHash('sha256').update(bytes).digest('hex')

    const result = await processOriginalImage(bytes)

    expect(before).toBe(fixture.checksum)
    expect(createHash('sha256').update(bytes).digest('hex')).toBe(before)
    expect(result.original.format).toBe(fixture.format)
    expect(result.original.width).toBe(fixture.width)
    expect(result.original.height).toBe(fixture.height)
    expect(result.original.capturedAt).toBeInstanceOf(Date)
    expect(result.original.cameraMake).toBeTruthy()
    expect(result.original.cameraModel).toBeTruthy()
    expect(result.original.captureLocation).not.toBeNull()
    expect(result.renditions).toHaveLength(4)
    expect(
      result.renditions.map((rendition) => [rendition.width, rendition.height]),
    ).toEqual(fixture.renditions)
    expect(
      result.renditions.every(
        (rendition) =>
          rendition.byteSize < bytes.byteLength &&
          rendition.width <= rendition.profileWidth,
      ),
    ).toBe(true)
  })
})
