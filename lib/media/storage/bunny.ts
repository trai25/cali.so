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
  originals: {
    zone: string
    password: string
  }
  renditions: {
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
  originalsClient?: S3Client
  renditionsClient?: S3Client
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

function originalChunkObjectKey(originalKey: string, chunkIndex: number) {
  assertObjectKey(originalKey)
  if (!Number.isSafeInteger(chunkIndex) || chunkIndex < 0) {
    throw new TypeError('Invalid Original transfer chunk index')
  }
  return `transfer-chunks/${originalKey}/${chunkIndex}.part`
}

export function createPublicRenditionUrl(cdnBaseUrl: URL) {
  return function publicRenditionUrl(key: string) {
    assertObjectKey(key)
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
  assertObjectKey(key)
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
  const originals =
    dependencies.originalsClient ?? createClient(config.region, config.originals)
  const renditions =
    dependencies.renditionsClient ?? createClient(config.region, config.renditions)
  const request = dependencies.fetch ?? fetch

  const publicRenditionUrl = createPublicRenditionUrl(
    config.renditions.cdnBaseUrl,
  )

  async function deleteObject(client: S3Client, bucket: string, key: string) {
    assertObjectKey(key)
    try {
      await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }))
    } catch (error) {
      if (providerStatus(error) === 404) return
      throw new BunnyStorageError('provider_unavailable')
    }
  }

  async function inspectObject(client: S3Client, bucket: string, key: string) {
    assertObjectKey(key)
    let output
    try {
      output = await client.send(
        new HeadObjectCommand({
          Bucket: bucket,
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

  async function readObject(client: S3Client, bucket: string, key: string) {
    assertObjectKey(key)
    let output
    try {
      output = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }))
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
      assertObjectKey(input.key)
      const checksum = checksumBase64(input.checksumSha256)
      try {
        await originals.send(
          new PutObjectCommand({
            Bucket: config.originals.zone,
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
        await originals.send(
          new PutObjectCommand({
            Bucket: config.originals.zone,
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
      return inspectObject(originals, config.originals.zone, key)
    },

    async readOriginal(key: string) {
      return readObject(originals, config.originals.zone, key)
    },

    readOriginalChunk(originalKey: string, chunkIndex: number) {
      return readObject(
        originals,
        config.originals.zone,
        originalChunkObjectKey(originalKey, chunkIndex),
      )
    },

    async inspectOriginalChunk(originalKey: string, chunkIndex: number) {
      try {
        return await inspectObject(
          originals,
          config.originals.zone,
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
        await renditions.send(
          new PutObjectCommand({
            Bucket: config.renditions.zone,
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
      return inspectObject(renditions, config.renditions.zone, key)
    },

    async readRendition(key: string) {
      return readObject(renditions, config.renditions.zone, key)
    },

    deleteOriginal(key: string) {
      return deleteObject(originals, config.originals.zone, key)
    },

    deleteOriginalChunk(originalKey: string, chunkIndex: number) {
      return deleteObject(
        originals,
        config.originals.zone,
        originalChunkObjectKey(originalKey, chunkIndex),
      )
    },

    deleteRendition(key: string) {
      return deleteObject(renditions, config.renditions.zone, key)
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
