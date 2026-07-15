import { createHash } from 'node:crypto'

import { describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

import {
  MAX_ORIGINAL_UPLOAD_BYTES,
  storeOriginalFromSameOriginRequest,
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
      'content-type': expectation.contentType,
      origin: canonicalBaseUrl.origin,
      'sec-fetch-site': 'same-origin',
      'x-media-checksum-sha256': expectation.checksumSha256,
      ...headers,
    },
    body,
  })
}

function fixture() {
  return {
    authorize: vi.fn(async () => true),
    storage: { storeOriginal: vi.fn(async () => undefined) },
  }
}

describe('same-origin Original upload transfer', () => {
  it('stores bytes only after binding them to an authorized Upload Intent', async () => {
    const f = fixture()

    const response = await storeOriginalFromSameOriginRequest({
      request: uploadRequest(),
      canonicalBaseUrl,
      expectation,
      ...f,
    })

    expect(response.status).toBe(204)
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(f.authorize).toHaveBeenCalledTimes(1)
    expect(f.storage.storeOriginal).toHaveBeenCalledWith({
      key: expectation.key,
      bytes,
      contentType: expectation.contentType,
      checksumSha256: expectation.checksumSha256,
    })
  })

  it.each<[string, Record<string, string>]>([
    ['wrong origin', { origin: 'https://attacker.example' }],
    ['cross-site context', { 'sec-fetch-site': 'cross-site' }],
    ['missing origin', { origin: '' }],
  ])('rejects a %s before authorization or storage', async (_label, headers) => {
    const f = fixture()

    const response = await storeOriginalFromSameOriginRequest({
      request: uploadRequest(bytes, headers),
      canonicalBaseUrl,
      expectation,
      ...f,
    })

    expect(response.status).toBe(403)
    expect(f.authorize).not.toHaveBeenCalled()
    expect(f.storage.storeOriginal).not.toHaveBeenCalled()
  })

  it('requires owner authorization on every transfer', async () => {
    const f = fixture()
    f.authorize.mockResolvedValue(false)

    const response = await storeOriginalFromSameOriginRequest({
      request: uploadRequest(),
      canonicalBaseUrl,
      expectation,
      ...f,
    })

    expect(response.status).toBe(401)
    expect(f.storage.storeOriginal).not.toHaveBeenCalled()
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
      { 'x-media-checksum-sha256': '0'.repeat(64) },
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
    [
      'body checksum',
      {},
      { ...expectation, checksumSha256: '0'.repeat(64) },
      bytes,
      422,
    ],
  ])(
    'rejects a mismatched %s without writing to Bunny',
    async (_label, headers, uploadExpectation, body, status) => {
      const f = fixture()

      const response = await storeOriginalFromSameOriginRequest({
        request: uploadRequest(body, headers),
        canonicalBaseUrl,
        expectation: uploadExpectation,
        ...f,
      })

      expect(response.status).toBe(status)
      expect(f.storage.storeOriginal).not.toHaveBeenCalled()
    },
  )

  it('rejects an Upload Intent larger than the explicit server limit', async () => {
    const f = fixture()

    const response = await storeOriginalFromSameOriginRequest({
      request: uploadRequest(),
      canonicalBaseUrl,
      expectation: {
        ...expectation,
        byteSize: MAX_ORIGINAL_UPLOAD_BYTES + 1,
      },
      ...f,
    })

    expect(response.status).toBe(413)
    expect(f.storage.storeOriginal).not.toHaveBeenCalled()
  })

  it('returns a retryable safe response when Bunny is unavailable', async () => {
    const f = fixture()
    f.storage.storeOriginal.mockRejectedValue(
      new Error('originals-zone-password raw provider detail'),
    )

    const response = await storeOriginalFromSameOriginRequest({
      request: uploadRequest(),
      canonicalBaseUrl,
      expectation,
      ...f,
    })

    expect(response.status).toBe(503)
    expect(response.headers.get('retry-after')).toBe('5')
    expect(await response.text()).not.toContain('raw provider detail')
  })
})
