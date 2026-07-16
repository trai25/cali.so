import 'server-only'

import { createHash } from 'node:crypto'

import { and, eq, lte, sql } from 'drizzle-orm'

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
      const windowStartedAt = new Date(
        now.getTime() - policy.windowSeconds * 1_000,
      )
      const keyHash = createHash('sha256').update(key).digest('hex')
      const client = database()

      await client
        .delete(rateLimitWindows)
        .where(
          and(
            eq(rateLimitWindows.scope, policy.prefix),
            eq(rateLimitWindows.keyHash, keyHash),
            lte(rateLimitWindows.windowExpiresAt, now),
          ),
        )

      const activeRequestTimes = sql<Date[]>`ARRAY(
        SELECT requested_at
        FROM unnest(${rateLimitWindows.requestTimes}) AS active_request(requested_at)
        WHERE requested_at > ${windowStartedAt}
      )`

      const [window] = await client
        .insert(rateLimitWindows)
        .values({
          scope: policy.prefix,
          keyHash,
          requestTimes: [now],
          windowExpiresAt,
        })
        .onConflictDoUpdate({
          target: [rateLimitWindows.scope, rateLimitWindows.keyHash],
          set: {
            requestTimes: sql`${activeRequestTimes} || ARRAY[${now}]::timestamptz[]`,
            windowExpiresAt,
          },
          setWhere: sql`cardinality(${activeRequestTimes}) < ${policy.maxRequests}`,
        })
        .returning({
          requestCount: sql<number>`cardinality(${rateLimitWindows.requestTimes})`,
        })

      if (!window) return { success: false }
      return { success: window.requestCount <= policy.maxRequests }
    },
  }
}
