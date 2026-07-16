import 'server-only'

import { createHash } from 'node:crypto'

import { lte, sql } from 'drizzle-orm'

import { getDatabase } from '~/db'
import { rateLimitWindows } from '~/db/schema'

import type { Clock, RateLimitPolicy } from './types'

export type RateLimitDatabase = ReturnType<typeof getDatabase>

export function createDatabaseRateLimiter(
  database: () => RateLimitDatabase,
  policy: RateLimitPolicy,
  clock: Clock = { now: () => new Date() },
) {
  return {
    async limit(key: string) {
      const now = clock.now()
      const windowExpiresAt = new Date(
        now.getTime() + policy.windowSeconds * 1_000,
      )
      const keyHash = createHash('sha256').update(key).digest('hex')
      const client = database()

      await client
        .delete(rateLimitWindows)
        .where(lte(rateLimitWindows.windowExpiresAt, now))

      const [window] = await client
        .insert(rateLimitWindows)
        .values({
          scope: policy.prefix,
          keyHash,
          requestCount: 1,
          windowExpiresAt,
        })
        .onConflictDoUpdate({
          target: [rateLimitWindows.scope, rateLimitWindows.keyHash],
          set: {
            requestCount: sql`${rateLimitWindows.requestCount} + 1`,
          },
        })
        .returning({ requestCount: rateLimitWindows.requestCount })

      return { success: window.requestCount <= policy.maxRequests }
    },
  }
}
