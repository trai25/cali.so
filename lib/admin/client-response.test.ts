import { beforeEach, describe, expect, it, vi } from 'vitest'

import { reloadLocation } from '~/lib/navigation'

import { adminResponseJson } from './client-response'

vi.mock('~/lib/navigation', () => ({ reloadLocation: vi.fn() }))

describe('admin client responses', () => {
  beforeEach(() => {
    vi.mocked(reloadLocation).mockClear()
  })

  it('re-enters authentication after an expired owner session', async () => {
    await expect(
      adminResponseJson(
        Response.json({ error: 'unauthorized' }, { status: 401 }),
      ),
    ).rejects.toThrow('unauthorized')

    expect(reloadLocation).toHaveBeenCalledOnce()
  })

  it('returns successful JSON without navigating', async () => {
    await expect(
      adminResponseJson(Response.json({ ok: true })),
    ).resolves.toEqual({ ok: true })
    expect(reloadLocation).not.toHaveBeenCalled()
  })

  it('re-enters authentication before parsing a non-JSON 401', async () => {
    await expect(
      adminResponseJson(new Response(null, { status: 401 })),
    ).rejects.toThrow('request_failed')
    expect(reloadLocation).toHaveBeenCalledOnce()
  })
})
