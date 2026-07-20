import { describe, expect, it, vi } from 'vitest'

import { uploadChunkWithRetry } from './client'

describe('Media Transfer chunk client', () => {
  it('returns authentication failures without retrying them', async () => {
    const fetcher = vi.fn(async () =>
      Response.json({ error: 'unauthorized' }, { status: 401 }),
    )
    const wait = vi.fn(async () => undefined)

    const response = await uploadChunkWithRetry('/upload', {}, { fetcher, wait })

    expect(response.status).toBe(401)
    expect(fetcher).toHaveBeenCalledOnce()
    expect(wait).not.toHaveBeenCalled()
  })

  it('honors Retry-After seconds before retrying a rate limit', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        Response.json(
          { error: 'rate_limited' },
          { status: 429, headers: { 'retry-after': '7' } },
        ),
      )
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
    const wait = vi.fn(async () => undefined)

    const response = await uploadChunkWithRetry('/upload', {}, { fetcher, wait })

    expect(response.status).toBe(204)
    expect(fetcher).toHaveBeenCalledTimes(2)
    expect(wait).toHaveBeenCalledOnce()
    expect(wait).toHaveBeenCalledWith(7_000)
  })

  it('honors Retry-After HTTP dates on transient failures', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(null, {
          status: 503,
          headers: { 'retry-after': 'Mon, 20 Jul 2026 10:00:05 GMT' },
        }),
      )
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
    const wait = vi.fn(async () => undefined)

    await uploadChunkWithRetry('/upload', {}, {
      fetcher,
      wait,
      now: () => Date.parse('2026-07-20T10:00:00.000Z'),
    })

    expect(wait).toHaveBeenCalledWith(5_000)
  })

  it('uses bounded backoff for network failures', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockRejectedValueOnce(new TypeError('offline'))
      .mockRejectedValueOnce(new TypeError('offline'))
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
    const wait = vi.fn(async () => undefined)

    await expect(
      uploadChunkWithRetry('/upload', {}, { fetcher, wait }),
    ).resolves.toMatchObject({ status: 204 })
    expect(wait.mock.calls).toEqual([[150], [300]])
  })
})
