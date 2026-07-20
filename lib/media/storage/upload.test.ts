import { createHash } from 'node:crypto'

import { describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

import {
  MAX_ORIGINAL_UPLOAD_CHUNK_BYTES,
  MAX_ORIGINAL_UPLOAD_BYTES,
  storeOriginalChunkFromSameOriginRequest,
} from './upload'

const canonicalBaseUrl = new URL('https://cali.so')
const bytes = new TextEncoder().encode('private image bytes')
const expectation = {
  key: 'originals/asset_01/revision_01.heic',
  contentType: 'image/heic',
  byteSize: bytes.byteLength,
  checksumSha256: createHash('sha256').update(bytes).digest('hex'),
}

function uploadRequest(
  body: BodyInit = bytes,
  headers: Record<string, string> = {},
) {
  return new Request('https://cali.so/api/admin/media/uploads/intent_01', {
    method: 'PUT',
    headers: {
      'content-type': 'application/octet-stream',
      origin: canonicalBaseUrl.origin,
      'sec-fetch-site': 'same-origin',
      'x-media-chunk-sha256': expectation.checksumSha256,
      ...headers,
    },
    body,
  })
}

function fixture() {
  return {
    authorize: vi.fn(async () => true),
    storage: {
      inspectOriginalChunk: vi.fn(async () => null),
      storeOriginalChunk: vi.fn(async () => undefined),
    },
  }
}

describe('same-origin Original upload transfer', () => {
  it('stores one bounded chunk without proxying the complete Original', async () => {
    const storeOriginalChunk = vi.fn(async () => undefined)
    const chunkChecksumSha256 = createHash('sha256').update(bytes).digest('hex')

    const response = await storeOriginalChunkFromSameOriginRequest({
      request: uploadRequest(bytes, {
        'content-type': 'application/octet-stream',
        'x-media-chunk-sha256': chunkChecksumSha256,
      }),
      canonicalBaseUrl,
      expectation,
      chunkIndex: 0,
      authorize: vi.fn(async () => true),
      storage: {
        inspectOriginalChunk: vi.fn(async () => null),
        storeOriginalChunk,
      },
    })

    expect(MAX_ORIGINAL_UPLOAD_CHUNK_BYTES).toBeLessThan(4_500_000)
    expect(response.status).toBe(204)
    expect(storeOriginalChunk).toHaveBeenCalledWith({
      originalKey: expectation.key,
      chunkIndex: 0,
      bytes,
      checksumSha256: chunkChecksumSha256,
    })
  })

  it('requires each preceding chunk before accepting the next one', async () => {
    const f = fixture()
    const twoChunkExpectation = {
      ...expectation,
      byteSize: MAX_ORIGINAL_UPLOAD_CHUNK_BYTES + bytes.byteLength,
    }
    const response = await storeOriginalChunkFromSameOriginRequest({
      request: uploadRequest(),
      canonicalBaseUrl,
      expectation: twoChunkExpectation,
      chunkIndex: 1,
      ...f,
    })

    expect(response.status).toBe(409)
    expect(f.storage.inspectOriginalChunk).toHaveBeenCalledWith(
      expectation.key,
      0,
    )
    expect(f.storage.storeOriginalChunk).not.toHaveBeenCalled()
  })

  it('stores bytes only after binding them to an authorized Upload Intent', async () => {
    const f = fixture()

    const response = await storeOriginalChunkFromSameOriginRequest({
      request: uploadRequest(),
      canonicalBaseUrl,
      expectation,
      chunkIndex: 0,
      ...f,
    })

    expect(response.status).toBe(204)
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(f.authorize).toHaveBeenCalledTimes(1)
    expect(f.storage.storeOriginalChunk).toHaveBeenCalledWith({
      originalKey: expectation.key,
      chunkIndex: 0,
      bytes,
      checksumSha256: expectation.checksumSha256,
    })
  })

  it.each<[string, Record<string, string>]>([
    ['wrong origin', { origin: 'https://attacker.example' }],
    ['cross-site context', { 'sec-fetch-site': 'cross-site' }],
    ['missing origin', { origin: '' }],
  ])('rejects a %s before authorization or storage', async (_label, headers) => {
    const f = fixture()

    const response = await storeOriginalChunkFromSameOriginRequest({
      request: uploadRequest(bytes, headers),
      canonicalBaseUrl,
      expectation,
      chunkIndex: 0,
      ...f,
    })

    expect(response.status).toBe(403)
    expect(f.authorize).not.toHaveBeenCalled()
    expect(f.storage.storeOriginalChunk).not.toHaveBeenCalled()
  })

  it('requires owner authorization on every transfer', async () => {
    const f = fixture()
    f.authorize.mockResolvedValue(false)

    const response = await storeOriginalChunkFromSameOriginRequest({
      request: uploadRequest(),
      canonicalBaseUrl,
      expectation,
      chunkIndex: 0,
      ...f,
    })

    expect(response.status).toBe(401)
    expect(f.storage.storeOriginalChunk).not.toHaveBeenCalled()
  })

  it('keeps authorization infrastructure failures retryable', async () => {
    const f = fixture()
    f.authorize.mockRejectedValue(new Error('database unavailable'))

    const response = await storeOriginalChunkFromSameOriginRequest({
      request: uploadRequest(),
      canonicalBaseUrl,
      expectation,
      chunkIndex: 0,
      ...f,
    })

    expect(response.status).toBe(503)
    expect(response.headers.get('retry-after')).toBe('5')
    expect(f.storage.storeOriginalChunk).not.toHaveBeenCalled()
  })

  it.each<
    [
      string,
      Record<string, string>,
      typeof expectation,
      typeof bytes,
      number,
    ]
  >([
    [
      'content type',
      { 'content-type': 'image/png' },
      expectation,
      bytes,
      415,
    ],
    [
      'checksum header',
      { 'x-media-chunk-sha256': '0'.repeat(64) },
      expectation,
      bytes,
      422,
    ],
    [
      'byte size',
      {},
      { ...expectation, byteSize: expectation.byteSize - 1 },
      bytes,
      422,
    ],
  ])(
    'rejects a mismatched %s without writing to Bunny',
    async (_label, headers, uploadExpectation, body, status) => {
      const f = fixture()

      const response = await storeOriginalChunkFromSameOriginRequest({
        request: uploadRequest(body, headers),
        canonicalBaseUrl,
        expectation: uploadExpectation,
        chunkIndex: 0,
        ...f,
      })

      expect(response.status).toBe(status)
      expect(f.storage.storeOriginalChunk).not.toHaveBeenCalled()
    },
  )

  it('rejects an Upload Intent larger than the explicit server limit', async () => {
    const f = fixture()

    const response = await storeOriginalChunkFromSameOriginRequest({
      request: uploadRequest(),
      canonicalBaseUrl,
      expectation: {
        ...expectation,
        byteSize: MAX_ORIGINAL_UPLOAD_BYTES + 1,
      },
      chunkIndex: 0,
      ...f,
    })

    expect(response.status).toBe(413)
    expect(f.storage.storeOriginalChunk).not.toHaveBeenCalled()
  })

  it('returns a retryable safe response when Bunny is unavailable', async () => {
    const f = fixture()
    f.storage.storeOriginalChunk.mockRejectedValue(
      new Error('originals-zone-password raw provider detail'),
    )

    const response = await storeOriginalChunkFromSameOriginRequest({
      request: uploadRequest(),
      canonicalBaseUrl,
      expectation,
      chunkIndex: 0,
      ...f,
    })

    expect(response.status).toBe(503)
    expect(response.headers.get('retry-after')).toBe('5')
    expect(await response.text()).not.toContain('raw provider detail')
  })
})
