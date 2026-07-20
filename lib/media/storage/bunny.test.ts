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
  media: {
    zone: 'cali-media-preview',
    password: 'media-zone-password',
    cdnBaseUrl: new URL('https://media-preview.cali.so/'),
  },
  cdnApiKey: 'preview-cdn-api-key',
}

describe('Bunny Media Storage', () => {
  it('uses one Media zone for Original and Rendition objects', async () => {
    const send = vi.fn(async (_command: unknown) => ({}))
    const storage = createBunnyStorage(config, {
      client: { send } as never,
    })
    const originalBytes = new TextEncoder().encode('original bytes')
    const renditionBytes = new TextEncoder().encode('rendition bytes')
    const originalChecksum = createHash('sha256')
      .update(originalBytes)
      .digest('hex')
    const renditionChecksum = createHash('sha256')
      .update(renditionBytes)
      .digest('hex')

    await storage.storeOriginal({
      key: 'originals/asset_01/revision_01.heic',
      bytes: originalBytes,
      contentType: 'image/heic',
      checksumSha256: originalChecksum,
    })
    await storage.storeRendition({
      key: `renditions/asset_01/photo-1600-${renditionChecksum}.jpg`,
      bytes: renditionBytes,
      checksumSha256: renditionChecksum,
      contentType: 'image/jpeg',
    })

    const buckets = send.mock.calls.map(([command]) => {
      if (!(command instanceof PutObjectCommand)) {
        throw new TypeError('Expected PutObject')
      }
      return command.input.Bucket
    })
    expect(buckets).toEqual(['cali-media-preview', 'cali-media-preview'])
  })

  it('rejects keys outside each Media namespace before contacting Bunny', async () => {
    const send = vi.fn(async (_command: unknown) => ({}))
    const storage = createBunnyStorage(config, {
      client: { send } as never,
    })
    const bytes = new TextEncoder().encode('misplaced bytes')
    const checksumSha256 = createHash('sha256').update(bytes).digest('hex')

    await expect(
      storage.storeOriginal({
        key: `renditions/asset_01/original-${checksumSha256}.jpg`,
        bytes,
        contentType: 'image/jpeg',
        checksumSha256,
      }),
    ).rejects.toThrow('originals/ namespace')
    await expect(
      storage.storeRendition({
        key: `originals/asset_01/rendition-${checksumSha256}.jpg`,
        bytes,
        contentType: 'image/jpeg',
        checksumSha256,
      }),
    ).rejects.toThrow('renditions/ namespace')
    expect(() =>
      storage.publicRenditionUrl('originals/asset_01/revision_01.jpg'),
    ).toThrow('renditions/ namespace')
    expect(send).not.toHaveBeenCalled()
  })

  it('stores an Original in the Media zone with explicit integrity metadata', async () => {
    const send = vi.fn(async (_command: unknown) => ({}))
    const storage = createBunnyStorage(config, {
      client: { send } as never,
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
      Bucket: 'cali-media-preview',
      Key: 'originals/asset_01/revision_01.heic',
      Body: bytes,
      ContentLength: 19,
      ContentType: 'image/heic',
      ChecksumSHA256: Buffer.from(checksum, 'hex').toString('base64'),
    })
  })

  it('stores, reads, and deletes an Original transfer chunk in the Media zone', async () => {
    const bytes = new TextEncoder().encode('private chunk bytes')
    const checksum = createHash('sha256').update(bytes).digest('hex')
    const send = vi.fn(async (command: unknown) => {
      if (command instanceof GetObjectCommand) {
        return { Body: { transformToByteArray: async () => bytes } }
      }
      if (command instanceof HeadObjectCommand) {
        return {
          ContentLength: bytes.byteLength,
          ContentType: 'application/octet-stream',
          LastModified: new Date('2026-07-20T00:00:00.000Z'),
        }
      }
      return {}
    })
    const storage = createBunnyStorage(config, {
      client: { send } as never,
    })

    await storage.storeOriginalChunk({
      originalKey: 'originals/asset_01/revision_01.heic',
      chunkIndex: 2,
      bytes,
      checksumSha256: checksum,
    })
    await expect(
      storage.readOriginalChunk(
        'originals/asset_01/revision_01.heic',
        2,
      ),
    ).resolves.toEqual(bytes)
    await expect(
      storage.inspectOriginalChunk(
        'originals/asset_01/revision_01.heic',
        2,
      ),
    ).resolves.toMatchObject({
      byteSize: bytes.byteLength,
      contentType: 'application/octet-stream',
    })
    await storage.deleteOriginalChunk(
      'originals/asset_01/revision_01.heic',
      2,
    )

    const expectedKey =
      'transfer-chunks/originals/asset_01/revision_01.heic/2.part'
    const [put, get, head, remove] = send.mock.calls.map(([command]) => command)
    expect(put).toBeInstanceOf(PutObjectCommand)
    expect(get).toBeInstanceOf(GetObjectCommand)
    expect(head).toBeInstanceOf(HeadObjectCommand)
    expect(remove).toBeInstanceOf(DeleteObjectCommand)
    if (
      !(put instanceof PutObjectCommand) ||
      !(get instanceof GetObjectCommand) ||
      !(head instanceof HeadObjectCommand) ||
      !(remove instanceof DeleteObjectCommand)
    ) {
      throw new TypeError('Expected Media chunk commands')
    }
    expect(put.input).toEqual({
      Bucket: 'cali-media-preview',
      Key: expectedKey,
      Body: bytes,
      ContentLength: bytes.byteLength,
      ContentType: 'application/octet-stream',
      ChecksumSHA256: Buffer.from(checksum, 'hex').toString('base64'),
    })
    expect(get.input).toEqual({
      Bucket: 'cali-media-preview',
      Key: expectedKey,
    })
    expect(head.input).toEqual({
      Bucket: 'cali-media-preview',
      Key: expectedKey,
    })
    expect(remove.input).toEqual({
      Bucket: 'cali-media-preview',
      Key: expectedKey,
    })
  })

  it('normalizes provider failures while storing an Original', async () => {
    const storage = createBunnyStorage(config, {
      client: {
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
      client: { send } as never,
    })
    const bytes = new TextEncoder().encode('public jpeg bytes')
    const checksum = createHash('sha256').update(bytes).digest('hex')
    const renditionKey = `renditions/asset_01/photo-1600-${checksum}.jpg`

    const publicUrl = await storage.storeRendition({
      key: renditionKey,
      bytes,
      checksumSha256: checksum,
      contentType: 'image/jpeg',
    })

    const command = send.mock.calls[0]?.[0]
    expect(command).toBeInstanceOf(PutObjectCommand)
    if (!(command instanceof PutObjectCommand)) throw new TypeError('Expected PutObject')
    expect(command.input).toEqual({
      Bucket: 'cali-media-preview',
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
      client: { send } as never,
    })
    const bytes = new TextEncoder().encode('public jpeg bytes')
    const checksum = createHash('sha256').update(bytes).digest('hex')

    await expect(
      storage.storeRendition({
        key: 'renditions/asset_01/photo-1600-v1.jpg',
        bytes,
        checksumSha256: checksum,
        contentType: 'image/jpeg',
      }),
    ).rejects.toThrow('Rendition key must contain its SHA-256 checksum')
    expect(send).not.toHaveBeenCalled()
  })

  it('rejects a non-JPEG Rendition contract before contacting Bunny', async () => {
    const send = vi.fn(async (_command: unknown) => ({}))
    const storage = createBunnyStorage(config, {
      client: { send } as never,
    })
    const bytes = new TextEncoder().encode('public image bytes')
    const checksum = createHash('sha256').update(bytes).digest('hex')

    await expect(
      storage.storeRendition({
        key: `renditions/asset_01/photo-1600-${checksum}.webp`,
        bytes,
        checksumSha256: checksum,
        contentType: 'image/webp',
      } as never),
    ).rejects.toThrow('JPEG object key')
    expect(send).not.toHaveBeenCalled()
  })

  it('verifies a Rendition in the public zone', async () => {
    const send = vi.fn(async (_command: unknown) => ({
      ContentLength: 756_727,
      ContentType: 'image/jpeg',
      LastModified: new Date('2026-07-15T00:00:00.000Z'),
    }))
    const storage = createBunnyStorage(config, {
      client: { send } as never,
    })

    const object = await storage.inspectRendition(
      'renditions/asset_01/photo-1600-v1.jpg',
    )

    const command = send.mock.calls[0]?.[0]
    expect(command).toBeInstanceOf(HeadObjectCommand)
    if (!(command instanceof HeadObjectCommand)) throw new TypeError('Expected HeadObject')
    expect(command.input).toEqual({
      Bucket: 'cali-media-preview',
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
      client: { send } as never,
    })

    const object = await storage.inspectOriginal(
      'originals/asset_01/revision_01.heic',
    )

    const command = send.mock.calls[0]?.[0]
    expect(command).toBeInstanceOf(HeadObjectCommand)
    if (!(command instanceof HeadObjectCommand)) throw new TypeError('Expected HeadObject')
    expect(command.input).toEqual({
      Bucket: 'cali-media-preview',
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
      new Error('cali-media-preview secret provider response'),
      { $metadata: { httpStatusCode: 404 } },
    )
    const storage = createBunnyStorage(config, {
      client: {
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

  it('reads Original bytes through the authenticated storage client', async () => {
    const bytes = new TextEncoder().encode('private image bytes')
    const send = vi.fn(async (_command: unknown) => ({
      Body: {
        transformToByteArray: async () => bytes,
      },
    }))
    const storage = createBunnyStorage(config, {
      client: { send } as never,
    })

    const original = await storage.readOriginal(
      'originals/asset_01/revision_01.heic',
    )

    const command = send.mock.calls[0]?.[0]
    expect(command).toBeInstanceOf(GetObjectCommand)
    if (!(command instanceof GetObjectCommand)) throw new TypeError('Expected GetObject')
    expect(command.input).toEqual({
      Bucket: 'cali-media-preview',
      Key: 'originals/asset_01/revision_01.heic',
    })
    expect(original).toEqual(bytes)
  })

  it('reads Rendition bytes through the authenticated storage client', async () => {
    const bytes = new TextEncoder().encode('public jpeg bytes')
    const send = vi.fn(async (_command: unknown) => ({
      Body: {
        transformToByteArray: async () => bytes,
      },
    }))
    const storage = createBunnyStorage(config, {
      client: { send } as never,
    })
    const key = 'renditions/asset_01/photo-1600-v1.jpg'

    await expect(storage.readRendition(key)).resolves.toEqual(bytes)

    const command = send.mock.calls[0]?.[0]
    expect(command).toBeInstanceOf(GetObjectCommand)
    if (!(command instanceof GetObjectCommand)) {
      throw new TypeError('Expected GetObject')
    }
    expect(command.input).toEqual({
      Bucket: 'cali-media-preview',
      Key: key,
    })
  })

  it('deletes Originals and Renditions individually from the Media zone', async () => {
    const send = vi.fn(async (_command: unknown) => ({}))
    const storage = createBunnyStorage(config, {
      client: { send } as never,
    })

    await storage.deleteOriginal('originals/asset_01/revision_01.heic')
    await storage.deleteRendition('renditions/asset_01/photo-1600-v1.jpg')

    const originalCommand = send.mock.calls[0]?.[0]
    const renditionCommand = send.mock.calls[1]?.[0]
    expect(originalCommand).toBeInstanceOf(DeleteObjectCommand)
    expect(renditionCommand).toBeInstanceOf(DeleteObjectCommand)
    if (
      !(originalCommand instanceof DeleteObjectCommand) ||
      !(renditionCommand instanceof DeleteObjectCommand)
    ) {
      throw new TypeError('Expected DeleteObject commands')
    }
    expect(originalCommand.input).toEqual({
      Bucket: 'cali-media-preview',
      Key: 'originals/asset_01/revision_01.heic',
    })
    expect(renditionCommand.input).toEqual({
      Bucket: 'cali-media-preview',
      Key: 'renditions/asset_01/photo-1600-v1.jpg',
    })
  })

  it('treats missing objects as already deleted for every Media namespace', async () => {
    const send = vi.fn(async () => {
      throw Object.assign(new Error('Not found'), {
        $metadata: { httpStatusCode: 404 },
      })
    })
    const storage = createBunnyStorage(config, {
      client: { send } as never,
    })

    await expect(
      storage.deleteOriginal('originals/asset_01/revision_01.heic'),
    ).resolves.toBeUndefined()
    await expect(
      storage.deleteOriginalChunk('originals/asset_01/revision_01.heic', 0),
    ).resolves.toBeUndefined()
    await expect(
      storage.deleteRendition('renditions/asset_01/photo-1600-v1.jpg'),
    ).resolves.toBeUndefined()
    expect(send).toHaveBeenCalledTimes(3)
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
      client: { send } as never,
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
