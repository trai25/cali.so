import { describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

import { createMediaReconciliationHandler } from './http'

describe('Media reconciliation HTTP boundary', () => {
  it('requires the Vercel Cron bearer secret and returns only safe counts', async () => {
    const run = vi.fn(async () => ({
      resumed: 2,
      cleaned: 1,
      suggested: 1,
      failed: 0,
    }))
    const handler = createMediaReconciliationHandler({
      cronSecret: 'cron-secret',
      getReconciliation: () => ({ run }),
    })
    const denied = await handler(
      new Request('https://cali.so/api/internal/media/reconcile'),
    )
    const allowed = await handler(
      new Request('https://cali.so/api/internal/media/reconcile', {
        headers: { authorization: 'Bearer cron-secret' },
      }),
    )

    expect(denied.status).toBe(401)
    expect(allowed.status).toBe(200)
    expect(allowed.headers.get('cache-control')).toBe('no-store')
    await expect(allowed.json()).resolves.toEqual({
      reconciliation: {
        resumed: 2,
        cleaned: 1,
        suggested: 1,
        failed: 0,
      },
    })
    expect(run).toHaveBeenCalledTimes(1)
  })

  it('fails closed without a configured secret', async () => {
    const handler = createMediaReconciliationHandler({
      cronSecret: undefined,
      getReconciliation: () => ({ run: vi.fn() }),
    })
    const response = await handler(
      new Request('https://cali.so/api/internal/media/reconcile', {
        headers: { authorization: 'Bearer anything' },
      }),
    )
    expect(response.status).toBe(503)
  })
})
