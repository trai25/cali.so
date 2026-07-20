import 'server-only'

import { createHash, timingSafeEqual } from 'node:crypto'

import {
  MAX_ORIGINAL_UPLOAD_BYTES,
  MAX_ORIGINAL_UPLOAD_CHUNK_BYTES,
  originalUploadChunkByteLength,
  originalUploadChunkCount,
} from './transfer'

export {
  MAX_ORIGINAL_UPLOAD_BYTES,
  MAX_ORIGINAL_UPLOAD_CHUNK_BYTES,
} from './transfer'

const originalContentTypes = new Set([
  'image/heic',
  'image/heif',
  'image/jpeg',
  'image/png',
])

export type OriginalUploadExpectation = {
  key: string
  contentType: string
  byteSize: number
  checksumSha256: string
}

type SameOriginOriginalChunkUpload = {
  request: Request
  canonicalBaseUrl: URL
  expectation: OriginalUploadExpectation
  chunkIndex: number
  authorize(request: Request): boolean | Promise<boolean>
  storage: {
    inspectOriginalChunk(
      originalKey: string,
      chunkIndex: number,
    ): Promise<{ byteSize: number; contentType: string } | null>
    storeOriginalChunk(input: {
      originalKey: string
      chunkIndex: number
      bytes: Uint8Array
      checksumSha256: string
    }): Promise<void>
  }
}

function uploadResponse(status: number, headers?: HeadersInit) {
  return new Response(null, {
    status,
    headers: {
      'cache-control': 'no-store',
      'referrer-policy': 'no-referrer',
      'x-content-type-options': 'nosniff',
      ...headers,
    },
  })
}

function checksumMatches(bytes: Uint8Array, expectedHex: string) {
  if (!/^[a-f0-9]{64}$/.test(expectedHex)) return false
  const actual = createHash('sha256').update(bytes).digest()
  const expected = Buffer.from(expectedHex, 'hex')
  return timingSafeEqual(actual, expected)
}

async function readBoundedBody(request: Request, maximumBytes: number) {
  const reader = request.body?.getReader()
  if (!reader) return new Uint8Array()

  const chunks: Uint8Array[] = []
  let byteSize = 0
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    byteSize += value.byteLength
    if (byteSize > maximumBytes) {
      await reader.cancel()
      return null
    }
    chunks.push(value)
  }

  const bytes = new Uint8Array(byteSize)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }
  return bytes
}

/**
 * Bounded server-side transfer boundary for an owner-authorized Upload Intent.
 * Each request stays below the hosting platform body limit, and the caller
 * resolves the protected Original key without exposing Bunny credentials.
 */
export async function storeOriginalChunkFromSameOriginRequest({
  request,
  canonicalBaseUrl,
  expectation,
  chunkIndex,
  authorize,
  storage,
}: SameOriginOriginalChunkUpload) {
  if (request.method !== 'PUT') {
    return uploadResponse(405, { allow: 'PUT' })
  }

  if (
    request.headers.get('origin') !== canonicalBaseUrl.origin ||
    request.headers.get('sec-fetch-site') !== 'same-origin'
  ) {
    return uploadResponse(403)
  }

  let authorized = false
  try {
    authorized = await authorize(request)
  } catch {
    return uploadResponse(503, { 'retry-after': '5' })
  }
  if (!authorized) return uploadResponse(401)

  if (
    !Number.isSafeInteger(expectation.byteSize) ||
    expectation.byteSize <= 0 ||
    expectation.byteSize > MAX_ORIGINAL_UPLOAD_BYTES ||
    !originalContentTypes.has(expectation.contentType)
  ) {
    return uploadResponse(413)
  }
  const chunkCount = originalUploadChunkCount(expectation.byteSize)
  if (
    !Number.isSafeInteger(chunkIndex) ||
    chunkIndex < 0 ||
    chunkIndex >= chunkCount
  ) {
    return uploadResponse(422)
  }
  if (request.headers.get('content-type') !== 'application/octet-stream') {
    return uploadResponse(415)
  }

  if (chunkIndex > 0) {
    let previousChunk
    try {
      previousChunk = await storage.inspectOriginalChunk(
        expectation.key,
        chunkIndex - 1,
      )
    } catch {
      return uploadResponse(503, { 'retry-after': '5' })
    }
    if (
      !previousChunk ||
      previousChunk.byteSize !== MAX_ORIGINAL_UPLOAD_CHUNK_BYTES ||
      previousChunk.contentType !== 'application/octet-stream'
    ) {
      return uploadResponse(409)
    }
  }

  const checksumSha256 = request.headers.get('x-media-chunk-sha256') ?? ''
  const expectedByteSize = originalUploadChunkByteLength(
    expectation.byteSize,
    chunkIndex,
  )
  const declaredByteSize = request.headers.get('content-length')
  if (
    declaredByteSize !== null &&
    (!/^\d+$/.test(declaredByteSize) ||
      Number(declaredByteSize) !== expectedByteSize)
  ) {
    return uploadResponse(422)
  }

  let bytes: Uint8Array | null
  try {
    bytes = await readBoundedBody(request, expectedByteSize)
  } catch {
    return uploadResponse(400)
  }
  if (
    !bytes ||
    bytes.byteLength !== expectedByteSize ||
    !checksumMatches(bytes, checksumSha256)
  ) {
    return uploadResponse(422)
  }

  try {
    await storage.storeOriginalChunk({
      originalKey: expectation.key,
      chunkIndex,
      bytes,
      checksumSha256,
    })
  } catch {
    return uploadResponse(503, { 'retry-after': '5' })
  }

  return uploadResponse(204)
}
