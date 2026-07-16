import { readFile } from 'node:fs/promises'

import { PGlite } from '@electric-sql/pglite'
import { drizzle } from 'drizzle-orm/pglite'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

import {
  createDatabaseRateLimiter,
  type RateLimitDatabase,
} from './repository'

const migrationUrl = new URL(
  '../../db/migrations/0010_rate_limit_windows.sql',
  import.meta.url,
)

describe('database rate limiter', () => {
  let client: PGlite
  let now: Date

  beforeEach(async () => {
    client = new PGlite()
    const migration = await readFile(migrationUrl, 'utf8')
    await client.exec(migration.replaceAll('--> statement-breakpoint', ''))
    now = new Date('2026-07-16T06:00:00.000Z')
  })

  afterEach(async () => {
    await client.close()
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
