import 'server-only'

import { createHash, timingSafeEqual } from 'node:crypto'

export const MAX_ORIGINAL_UPLOAD_BYTES = 50 * 1024 * 1024

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

type OriginalStorage = {
  storeOriginal(input: {
    key: string
    bytes: Uint8Array
    contentType: string
    checksumSha256: string
  }): Promise<void>
}

type SameOriginOriginalUpload = {
  request: Request
  canonicalBaseUrl: URL
  expectation: OriginalUploadExpectation
  authorize(request: Request): boolean | Promise<boolean>
  storage: OriginalStorage
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
 * Server-side transfer boundary for an owner-authorized Upload Intent.
 * The caller resolves the intent and supplies its immutable expectations;
 * this function never exposes Bunny credentials or a provider upload URL.
 */
export async function storeOriginalFromSameOriginRequest({
  request,
  canonicalBaseUrl,
  expectation,
  authorize,
  storage,
}: SameOriginOriginalUpload) {
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
    expectation.byteSize > MAX_ORIGINAL_UPLOAD_BYTES
  ) {
    return uploadResponse(413)
  }
  if (
    !originalContentTypes.has(expectation.contentType) ||
    request.headers.get('content-type') !== expectation.contentType
  ) {
    return uploadResponse(415)
  }
  if (
    request.headers.get('x-media-checksum-sha256') !==
    expectation.checksumSha256
  ) {
    return uploadResponse(422)
  }

  const declaredByteSize = request.headers.get('content-length')
  if (
    declaredByteSize !== null &&
    (!/^\d+$/.test(declaredByteSize) ||
      Number(declaredByteSize) !== expectation.byteSize)
  ) {
    return uploadResponse(422)
  }

  let bytes: Uint8Array | null
  try {
    bytes = await readBoundedBody(request, expectation.byteSize)
  } catch {
    return uploadResponse(400)
  }
  if (
    !bytes ||
    bytes.byteLength !== expectation.byteSize ||
    !checksumMatches(bytes, expectation.checksumSha256)
  ) {
    return uploadResponse(422)
  }

  try {
    await storage.storeOriginal({
      key: expectation.key,
      bytes,
      contentType: expectation.contentType,
      checksumSha256: expectation.checksumSha256,
    })
  } catch {
    return uploadResponse(503, { 'retry-after': '5' })
  }

  return uploadResponse(204)
}
