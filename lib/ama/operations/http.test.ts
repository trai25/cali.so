import { describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

import { createAmaWorkHandler } from './http'

const RUN_RESULT = { claimed: 2, succeeded: 1, retried: 1, failed: 0 }

function fixture(options: { cronSecret?: string; throws?: boolean } = {}) {
  const releaseExpiredHolds = vi.fn(async () => {
    if (options.throws) throw new Error('db down')
    return 3
  })
  const runOperations = vi.fn(async () => RUN_RESULT)
  const handler = createAmaWorkHandler({
    cronSecret: 'cronSecret' in options ? options.cronSecret : 'cron-secret',
    getWork: () => ({ releaseExpiredHolds, runOperations }),
  })
  return { handler, releaseExpiredHolds, runOperations }
}

function workRequest(authorization?: string) {
  return new Request('https://cali.so/api/internal/ama/work', {
    headers: authorization ? { authorization } : {},
  })
}

describe('AMA work HTTP boundary', () => {
  it('fails closed without a configured cron secret', async () => {
    const f = fixture({ cronSecret: undefined })

    const response = await f.handler(workRequest('Bearer anything'))

    expect(response.status).toBe(503)
    await expect(response.json()).resolves.toEqual({ error: 'feature_disabled' })
    expect(f.releaseExpiredHolds).not.toHaveBeenCalled()
  })

  it('rejects a request without a bearer token before any work', async () => {
    const f = fixture()

    const response = await f.handler(workRequest())

    expect(response.status).toBe(401)
    await expect(response.json()).resolves.toEqual({ error: 'unauthorized' })
    expect(f.releaseExpiredHolds).not.toHaveBeenCalled()
    expect(f.runOperations).not.toHaveBeenCalled()
  })

  it('rejects a wrong bearer secret before any work', async () => {
    const f = fixture()

    const response = await f.handler(workRequest('Bearer wrong-secret'))

    expect(response.status).toBe(401)
    expect(f.releaseExpiredHolds).not.toHaveBeenCalled()
  })

  it('sweeps holds, runs operations, and reports only safe counts', async () => {
    const f = fixture()

    const response = await f.handler(workRequest('Bearer cron-secret'))

    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('no-store')
    await expect(response.json()).resolves.toEqual({
      work: { releasedHolds: 3, operations: RUN_RESULT },
    })
    expect(f.releaseExpiredHolds).toHaveBeenCalledTimes(1)
    expect(f.runOperations).toHaveBeenCalledTimes(1)
  })

  it('answers 503 when the work dependencies fail', async () => {
    const f = fixture({ throws: true })

    const response = await f.handler(workRequest('Bearer cron-secret'))

    expect(response.status).toBe(503)
    await expect(response.json()).resolves.toEqual({
      error: 'dependency_unavailable',
    })
  })
})
