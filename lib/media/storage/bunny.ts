import 'server-only'

import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3'

export const BUNNY_STORAGE_REGIONS = [
  'de',
  'ny',
  'sg',
  'uk',
  'se',
  'la',
  'jh',
  'syd',
] as const

export type BunnyStorageRegion = (typeof BUNNY_STORAGE_REGIONS)[number]

export type BunnyStorageConfig = {
  region: BunnyStorageRegion
  media: {
    zone: string
    password: string
    cdnBaseUrl: URL
  }
  cdnApiKey: string
}

export type BunnyStorageErrorCode =
  | 'not_found'
  | 'invalid_response'
  | 'provider_unavailable'

export class BunnyStorageError extends Error {
  constructor(readonly code: BunnyStorageErrorCode) {
    super(
      code === 'not_found'
        ? 'Media object was not found.'
        : 'Media storage is temporarily unavailable.',
    )
    this.name = 'BunnyStorageError'
  }
}

type BunnyStorageDependencies = {
  client?: S3Client
  fetch?: typeof fetch
}

function createClient(
  region: BunnyStorageRegion,
  credentials: { zone: string; password: string },
) {
  return new S3Client({
    endpoint: `https://${region}-s3.storage.bunnycdn.com`,
    region,
    forcePathStyle: true,
    credentials: {
      accessKeyId: credentials.zone,
      secretAccessKey: credentials.password,
    },
  })
}

function assertObjectKey(key: string) {
  if (
    !key ||
    key.startsWith('/') ||
    key.includes('\\') ||
    key.split('/').some((segment) => !segment || segment === '.' || segment === '..') ||
    /[\u0000-\u001f?#]/.test(key)
  ) {
    throw new TypeError('Invalid Bunny object key')
  }
}

function assertObjectNamespace(
  key: string,
  namespace: 'originals' | 'renditions',
) {
  assertObjectKey(key)
  if (!key.startsWith(`${namespace}/`)) {
    throw new TypeError(`Media object key must use the ${namespace}/ namespace`)
  }
}

function assertOriginalObjectKey(key: string) {
  assertObjectNamespace(key, 'originals')
}

function assertRenditionObjectKey(key: string) {
  assertObjectNamespace(key, 'renditions')
}

function originalChunkObjectKey(originalKey: string, chunkIndex: number) {
  assertOriginalObjectKey(originalKey)
  if (!Number.isSafeInteger(chunkIndex) || chunkIndex < 0) {
    throw new TypeError('Invalid Original transfer chunk index')
  }
  return `transfer-chunks/${originalKey}/${chunkIndex}.part`
}

export function createPublicRenditionUrl(cdnBaseUrl: URL) {
  return function publicRenditionUrl(key: string) {
    assertRenditionObjectKey(key)
    const encodedKey = key.split('/').map(encodeURIComponent).join('/')
    return new URL(encodedKey, cdnBaseUrl).toString()
  }
}

function checksumBase64(checksumSha256: string) {
  if (!/^[a-f0-9]{64}$/.test(checksumSha256)) {
    throw new TypeError('Invalid SHA-256 checksum')
  }
  return Buffer.from(checksumSha256, 'hex').toString('base64')
}

function assertContentAddressedRenditionKey(
  key: string,
  checksumSha256: string,
) {
  assertRenditionObjectKey(key)
  checksumBase64(checksumSha256)
  if (!key.toLowerCase().endsWith('.jpg')) {
    throw new TypeError('Renditions must use a JPEG object key')
  }
  if (!key.includes(checksumSha256)) {
    throw new TypeError('Rendition key must contain its SHA-256 checksum')
  }
}

function providerStatus(error: unknown) {
  if (typeof error !== 'object' || error === null) return undefined
  const metadata = Reflect.get(error, '$metadata')
  if (typeof metadata !== 'object' || metadata === null) return undefined
  const status = Reflect.get(metadata, 'httpStatusCode')
  return typeof status === 'number' ? status : undefined
}

export function createBunnyStorage(
  config: BunnyStorageConfig,
  dependencies: BunnyStorageDependencies = {},
) {
  const client =
    dependencies.client ?? createClient(config.region, config.media)
  const request = dependencies.fetch ?? fetch

  const publicRenditionUrl = createPublicRenditionUrl(
    config.media.cdnBaseUrl,
  )

  async function deleteObject(key: string) {
    assertObjectKey(key)
    try {
      await client.send(
        new DeleteObjectCommand({ Bucket: config.media.zone, Key: key }),
      )
    } catch (error) {
      if (providerStatus(error) === 404) return
      throw new BunnyStorageError('provider_unavailable')
    }
  }

  async function inspectObject(key: string) {
    assertObjectKey(key)
    let output
    try {
      output = await client.send(
        new HeadObjectCommand({
          Bucket: config.media.zone,
          Key: key,
        }),
      )
    } catch (error) {
      throw new BunnyStorageError(
        providerStatus(error) === 404 ? 'not_found' : 'provider_unavailable',
      )
    }
    if (
      typeof output.ContentLength !== 'number' ||
      output.ContentLength < 0 ||
      typeof output.ContentType !== 'string' ||
      !output.ContentType ||
      !(output.LastModified instanceof Date)
    ) {
      throw new BunnyStorageError('invalid_response')
    }
    return {
      byteSize: output.ContentLength,
      contentType: output.ContentType,
      lastModified: output.LastModified,
    }
  }

  async function readObject(key: string) {
    assertObjectKey(key)
    let output
    try {
      output = await client.send(
        new GetObjectCommand({ Bucket: config.media.zone, Key: key }),
      )
    } catch (error) {
      throw new BunnyStorageError(
        providerStatus(error) === 404 ? 'not_found' : 'provider_unavailable',
      )
    }
    if (!output.Body) throw new BunnyStorageError('invalid_response')
    try {
      return await output.Body.transformToByteArray()
    } catch {
      throw new BunnyStorageError('provider_unavailable')
    }
  }

  return {
    async storeOriginal(input: {
      key: string
      bytes: Uint8Array
      contentType: string
      checksumSha256: string
    }) {
      assertOriginalObjectKey(input.key)
      const checksum = checksumBase64(input.checksumSha256)
      try {
        await client.send(
          new PutObjectCommand({
            Bucket: config.media.zone,
            Key: input.key,
            Body: input.bytes,
            ContentLength: input.bytes.byteLength,
            ContentType: input.contentType,
            ChecksumSHA256: checksum,
          }),
        )
      } catch {
        throw new BunnyStorageError('provider_unavailable')
      }
    },

    async storeOriginalChunk(input: {
      originalKey: string
      chunkIndex: number
      bytes: Uint8Array
      checksumSha256: string
    }) {
      const key = originalChunkObjectKey(
        input.originalKey,
        input.chunkIndex,
      )
      const checksum = checksumBase64(input.checksumSha256)
      try {
        await client.send(
          new PutObjectCommand({
            Bucket: config.media.zone,
            Key: key,
            Body: input.bytes,
            ContentLength: input.bytes.byteLength,
            ContentType: 'application/octet-stream',
            ChecksumSHA256: checksum,
          }),
        )
      } catch {
        throw new BunnyStorageError('provider_unavailable')
      }
    },

    async inspectOriginal(key: string) {
      assertOriginalObjectKey(key)
      return inspectObject(key)
    },

    async readOriginal(key: string) {
      assertOriginalObjectKey(key)
      return readObject(key)
    },

    readOriginalChunk(originalKey: string, chunkIndex: number) {
      return readObject(originalChunkObjectKey(originalKey, chunkIndex))
    },

    async inspectOriginalChunk(originalKey: string, chunkIndex: number) {
      try {
        return await inspectObject(
          originalChunkObjectKey(originalKey, chunkIndex),
        )
      } catch (error) {
        if (error instanceof BunnyStorageError && error.code === 'not_found') {
          return null
        }
        throw error
      }
    },

    async storeRendition(input: {
      key: string
      bytes: Uint8Array
      checksumSha256: string
      contentType: 'image/jpeg'
    }) {
      assertContentAddressedRenditionKey(input.key, input.checksumSha256)
      if (input.contentType !== 'image/jpeg') {
        throw new TypeError('Renditions must use the image/jpeg content type')
      }
      const checksum = checksumBase64(input.checksumSha256)
      try {
        await client.send(
          new PutObjectCommand({
            Bucket: config.media.zone,
            Key: input.key,
            Body: input.bytes,
            ContentLength: input.bytes.byteLength,
            ContentType: input.contentType,
            ChecksumSHA256: checksum,
          }),
        )
      } catch {
        throw new BunnyStorageError('provider_unavailable')
      }
      return publicRenditionUrl(input.key)
    },

    async inspectRendition(key: string) {
      assertRenditionObjectKey(key)
      return inspectObject(key)
    },

    async readRendition(key: string) {
      assertRenditionObjectKey(key)
      return readObject(key)
    },

    deleteOriginal(key: string) {
      assertOriginalObjectKey(key)
      return deleteObject(key)
    },

    deleteOriginalChunk(originalKey: string, chunkIndex: number) {
      return deleteObject(originalChunkObjectKey(originalKey, chunkIndex))
    },

    deleteRendition(key: string) {
      assertRenditionObjectKey(key)
      return deleteObject(key)
    },

    async purgeRendition(key: string) {
      const url = new URL('https://api.bunny.net/purge')
      url.searchParams.set('url', publicRenditionUrl(key))
      url.searchParams.set('async', 'false')
      try {
        const response = await request(url, {
          method: 'POST',
          headers: { AccessKey: config.cdnApiKey },
          signal: AbortSignal.timeout(10_000),
        })
        if (response.ok) return
      } catch {
        throw new BunnyStorageError('provider_unavailable')
      }
      throw new BunnyStorageError('provider_unavailable')
    },

    publicRenditionUrl,
  }
}
