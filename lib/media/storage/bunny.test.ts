import { createHash } from 'node:crypto'

import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
} from '@aws-sdk/client-s3'
import { describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

import { BunnyStorageError, createBunnyStorage } from './bunny'

const config = {
  region: 'sg' as const,
  originals: {
    zone: 'cali-media-originals-preview',
    password: 'originals-zone-password',
  },
  renditions: {
    zone: 'cali-media-renditions-preview',
    password: 'renditions-zone-password',
    cdnBaseUrl: new URL('https://media-preview.cali.so/'),
  },
  cdnApiKey: 'preview-cdn-api-key',
}

describe('Bunny Media Storage', () => {
  it('stores an Original only in the private zone with explicit integrity metadata', async () => {
    const send = vi.fn(async (_command: unknown) => ({}))
    const storage = createBunnyStorage(config, {
      originalsClient: { send } as never,
    })
    const bytes = new TextEncoder().encode('private image bytes')
    const checksum = createHash('sha256').update(bytes).digest('hex')

    await storage.storeOriginal({
      key: 'originals/asset_01/revision_01.heic',
      bytes,
      contentType: 'image/heic',
      checksumSha256: checksum,
    })

    const command = send.mock.calls[0]?.[0]
    expect(command).toBeInstanceOf(PutObjectCommand)
    if (!(command instanceof PutObjectCommand)) throw new TypeError('Expected PutObject')
    expect(command.input).toEqual({
      Bucket: 'cali-media-originals-preview',
      Key: 'originals/asset_01/revision_01.heic',
      Body: bytes,
      ContentLength: 19,
      ContentType: 'image/heic',
      ChecksumSHA256: Buffer.from(checksum, 'hex').toString('base64'),
    })
  })

  it('normalizes provider failures while storing an Original', async () => {
    const storage = createBunnyStorage(config, {
      originalsClient: {
        send: vi.fn(async (_command: unknown) => {
          throw new Error('originals-zone-password raw provider detail')
        }),
      } as never,
    })
    const bytes = new TextEncoder().encode('private image bytes')

    const write = storage.storeOriginal({
      key: 'originals/asset_01/revision_01.heic',
      bytes,
      contentType: 'image/heic',
      checksumSha256: createHash('sha256').update(bytes).digest('hex'),
    })

    await expect(write).rejects.toEqual(
      new BunnyStorageError('provider_unavailable'),
    )
    await expect(write).rejects.not.toThrow(/raw provider detail/)
  })

  it('stores a Rendition in the public zone and derives its immutable CDN URL', async () => {
    const send = vi.fn(async (_command: unknown) => ({}))
    const storage = createBunnyStorage(config, {
      renditionsClient: { send } as never,
    })
    const bytes = new TextEncoder().encode('public jpeg bytes')
    const checksum = createHash('sha256').update(bytes).digest('hex')
    const renditionKey = `renditions/asset_01/photo-1600-${checksum}.jpg`

    const publicUrl = await storage.storeRendition({
      key: renditionKey,
      bytes,
      checksumSha256: checksum,
    })

    const command = send.mock.calls[0]?.[0]
    expect(command).toBeInstanceOf(PutObjectCommand)
    if (!(command instanceof PutObjectCommand)) throw new TypeError('Expected PutObject')
    expect(command.input).toEqual({
      Bucket: 'cali-media-renditions-preview',
      Key: renditionKey,
      Body: bytes,
      ContentLength: 17,
      ContentType: 'image/jpeg',
      ChecksumSHA256: Buffer.from(checksum, 'hex').toString('base64'),
    })
    expect(publicUrl).toBe(
      `https://media-preview.cali.so/${renditionKey}`,
    )
  })

  it('rejects an overwriteable Rendition key before contacting Bunny', async () => {
    const send = vi.fn(async (_command: unknown) => ({}))
    const storage = createBunnyStorage(config, {
      renditionsClient: { send } as never,
    })
    const bytes = new TextEncoder().encode('public jpeg bytes')
    const checksum = createHash('sha256').update(bytes).digest('hex')

    await expect(
      storage.storeRendition({
        key: 'renditions/asset_01/photo-1600-v1.jpg',
        bytes,
        checksumSha256: checksum,
      }),
    ).rejects.toThrow('Rendition key must contain its SHA-256 checksum')
    expect(send).not.toHaveBeenCalled()
  })

  it('verifies a Rendition in the public zone', async () => {
    const send = vi.fn(async (_command: unknown) => ({
      ContentLength: 756_727,
      ContentType: 'image/jpeg',
      LastModified: new Date('2026-07-15T00:00:00.000Z'),
    }))
    const storage = createBunnyStorage(config, {
      renditionsClient: { send } as never,
    })

    const object = await storage.inspectRendition(
      'renditions/asset_01/photo-1600-v1.jpg',
    )

    const command = send.mock.calls[0]?.[0]
    expect(command).toBeInstanceOf(HeadObjectCommand)
    if (!(command instanceof HeadObjectCommand)) throw new TypeError('Expected HeadObject')
    expect(command.input).toEqual({
      Bucket: 'cali-media-renditions-preview',
      Key: 'renditions/asset_01/photo-1600-v1.jpg',
    })
    expect(object).toEqual({
      byteSize: 756_727,
      contentType: 'image/jpeg',
      lastModified: new Date('2026-07-15T00:00:00.000Z'),
    })
  })

  it('verifies an Original without relying on an ETag', async () => {
    const send = vi.fn(async (_command: unknown) => ({
      ContentLength: 2_660_052,
      ContentType: 'image/heic',
      LastModified: new Date('2026-07-15T00:00:00.000Z'),
      ETag: undefined,
    }))
    const storage = createBunnyStorage(config, {
      originalsClient: { send } as never,
    })

    const object = await storage.inspectOriginal(
      'originals/asset_01/revision_01.heic',
    )

    const command = send.mock.calls[0]?.[0]
    expect(command).toBeInstanceOf(HeadObjectCommand)
    if (!(command instanceof HeadObjectCommand)) throw new TypeError('Expected HeadObject')
    expect(command.input).toEqual({
      Bucket: 'cali-media-originals-preview',
      Key: 'originals/asset_01/revision_01.heic',
    })
    expect(object).toEqual({
      byteSize: 2_660_052,
      contentType: 'image/heic',
      lastModified: new Date('2026-07-15T00:00:00.000Z'),
    })
    expect(object).not.toHaveProperty('etag')
  })

  it('reports a missing Original without exposing Bunny provider details', async () => {
    const providerError = Object.assign(
      new Error('cali-media-originals-preview secret provider response'),
      { $metadata: { httpStatusCode: 404 } },
    )
    const storage = createBunnyStorage(config, {
      originalsClient: {
        send: vi.fn(async (_command: unknown) => {
          throw providerError
        }),
      } as never,
    })

    const inspection = storage.inspectOriginal(
      'originals/asset_01/revision_01.heic',
    )

    await expect(inspection).rejects.toEqual(new BunnyStorageError('not_found'))
    await expect(inspection).rejects.not.toThrow(/secret provider response/)
  })

  it('reads private Original bytes through the authenticated storage client', async () => {
    const bytes = new TextEncoder().encode('private image bytes')
    const send = vi.fn(async (_command: unknown) => ({
      Body: {
        transformToByteArray: async () => bytes,
      },
    }))
    const storage = createBunnyStorage(config, {
      originalsClient: { send } as never,
    })

    const original = await storage.readOriginal(
      'originals/asset_01/revision_01.heic',
    )

    const command = send.mock.calls[0]?.[0]
    expect(command).toBeInstanceOf(GetObjectCommand)
    if (!(command instanceof GetObjectCommand)) throw new TypeError('Expected GetObject')
    expect(command.input).toEqual({
      Bucket: 'cali-media-originals-preview',
      Key: 'originals/asset_01/revision_01.heic',
    })
    expect(original).toEqual(bytes)
  })

  it('deletes Originals and Renditions individually from their own zones', async () => {
    const originalsSend = vi.fn(async (_command: unknown) => ({}))
    const renditionsSend = vi.fn(async (_command: unknown) => ({}))
    const storage = createBunnyStorage(config, {
      originalsClient: { send: originalsSend } as never,
      renditionsClient: { send: renditionsSend } as never,
    })

    await storage.deleteOriginal('originals/asset_01/revision_01.heic')
    await storage.deleteRendition('renditions/asset_01/photo-1600-v1.jpg')

    const originalCommand = originalsSend.mock.calls[0]?.[0]
    const renditionCommand = renditionsSend.mock.calls[0]?.[0]
    expect(originalCommand).toBeInstanceOf(DeleteObjectCommand)
    expect(renditionCommand).toBeInstanceOf(DeleteObjectCommand)
    if (
      !(originalCommand instanceof DeleteObjectCommand) ||
      !(renditionCommand instanceof DeleteObjectCommand)
    ) {
      throw new TypeError('Expected DeleteObject commands')
    }
    expect(originalCommand.input).toEqual({
      Bucket: 'cali-media-originals-preview',
      Key: 'originals/asset_01/revision_01.heic',
    })
    expect(renditionCommand.input).toEqual({
      Bucket: 'cali-media-renditions-preview',
      Key: 'renditions/asset_01/photo-1600-v1.jpg',
    })
  })

  it('purges the exact immutable Rendition URL from Bunny CDN', async () => {
    const fetch = vi.fn(async (_input: string | URL | Request, _init?: RequestInit) =>
      Response.json({ Message: 'Purged' }),
    )
    const storage = createBunnyStorage(config, { fetch })

    await storage.purgeRendition('renditions/asset_01/photo-1600-v1.jpg')

    const [requestUrl, init] = fetch.mock.calls[0] ?? []
    const url = new URL(String(requestUrl))
    expect(url.origin + url.pathname).toBe('https://api.bunny.net/purge')
    expect(url.searchParams.get('url')).toBe(
      'https://media-preview.cali.so/renditions/asset_01/photo-1600-v1.jpg',
    )
    expect(url.searchParams.get('async')).toBe('false')
    expect(init).toMatchObject({
      method: 'POST',
      headers: { AccessKey: 'preview-cdn-api-key' },
    })
    expect(init?.signal).toBeInstanceOf(AbortSignal)
  })

  it.each([404, 503])(
    'keeps an unconfirmed CDN purge retryable after HTTP %i',
    async (status) => {
      const storage = createBunnyStorage(config, {
        fetch: vi.fn(async () => new Response(null, { status })),
      })

      await expect(
        storage.purgeRendition('renditions/asset_01/photo-1600-v1.jpg'),
      ).rejects.toEqual(new BunnyStorageError('provider_unavailable'))
    },
  )

  it('exposes a partial Rendition removal when deletion succeeds but purge fails', async () => {
    const send = vi.fn(async (_command: unknown) => ({}))
    const storage = createBunnyStorage(config, {
      renditionsClient: { send } as never,
      fetch: vi.fn(async () => new Response(null, { status: 503 })),
    })
    const key = 'renditions/asset_01/photo-1600-v1.jpg'

    await expect(storage.deleteRendition(key)).resolves.toBeUndefined()
    await expect(storage.purgeRendition(key)).rejects.toEqual(
      new BunnyStorageError('provider_unavailable'),
    )
    expect(send).toHaveBeenCalledTimes(1)
    expect(send.mock.calls[0]?.[0]).toBeInstanceOf(DeleteObjectCommand)
  })
})
