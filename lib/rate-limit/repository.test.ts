import type { PGlite } from '@electric-sql/pglite'
import { drizzle } from 'drizzle-orm/pglite'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

import { usePGliteTestClient } from '~/db/testing/pglite'

import {
  createDatabaseRateLimiter,
  type RateLimitDatabase,
} from './repository'

describe('database rate limiter', () => {
  const getClient = usePGliteTestClient(['0010_rate_limit_windows.sql'])
  let client: PGlite
  let now: Date

  beforeEach(() => {
    client = getClient()
    now = new Date('2026-07-16T06:00:00.000Z')
  })

  it('allows only the configured number of concurrent requests', async () => {
    const limiter = createDatabaseRateLimiter(
      () => drizzle(client) as unknown as RateLimitDatabase,
      {
        prefix: 'cali:ama:owner-auth',
        maxRequests: 2,
        windowSeconds: 60,
      },
      { now: () => now },
    )

    const results = await Promise.all([
      limiter.limit('private-request-key'),
      limiter.limit('private-request-key'),
      limiter.limit('private-request-key'),
    ])

    expect(results.filter((result) => result.success)).toHaveLength(2)
  })

  it('starts a fresh allowance after the window expires', async () => {
    const limiter = createDatabaseRateLimiter(
      () => drizzle(client) as unknown as RateLimitDatabase,
      {
        prefix: 'cali:ama:admin-mutation',
        maxRequests: 1,
        windowSeconds: 60,
      },
      { now: () => now },
    )

    await expect(limiter.limit('private-owner-key')).resolves.toEqual({
      success: true,
    })
    await expect(limiter.limit('private-owner-key')).resolves.toEqual({
      success: false,
    })

    now = new Date('2026-07-16T06:01:00.000Z')

    await expect(limiter.limit('private-owner-key')).resolves.toEqual({
      success: true,
    })
  })

  it('does not allow a burst across the first request boundary', async () => {
    const limiter = createDatabaseRateLimiter(
      () => drizzle(client) as unknown as RateLimitDatabase,
      {
        prefix: 'cali:ama:admin-mutation',
        maxRequests: 3,
        windowSeconds: 60,
      },
      { now: () => now },
    )

    await expect(limiter.limit('private-owner-key')).resolves.toEqual({
      success: true,
    })

    now = new Date('2026-07-16T06:00:59.000Z')
    await expect(
      Promise.all([
        limiter.limit('private-owner-key'),
        limiter.limit('private-owner-key'),
      ]),
    ).resolves.toEqual([{ success: true }, { success: true }])

    now = new Date('2026-07-16T06:01:00.000Z')
    await expect(
      Promise.all([
        limiter.limit('private-owner-key'),
        limiter.limit('private-owner-key'),
      ]),
    ).resolves.toEqual([{ success: true }, { success: false }])
  })
})
