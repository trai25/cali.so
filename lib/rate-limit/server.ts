import 'server-only'

import { Ratelimit } from '@upstash/ratelimit'
import { Redis } from '@upstash/redis'

import { getDatabase } from '~/db'
import type { ServerEnvironment } from '~/lib/ama/server-env-schema'

import { createMemoryRateLimiter } from './memory'
import { createDatabaseRateLimiter } from './repository'
import type { RateLimitPolicy } from './types'

export function createRateLimiter(
  backend: ServerEnvironment['rateLimitBackend'],
  policy: RateLimitPolicy,
) {
  if (backend.kind === 'database') {
    return createDatabaseRateLimiter(getDatabase, policy)
  }

  if (backend.kind === 'memory') {
    return createMemoryRateLimiter(policy)
  }

  return new Ratelimit({
    redis: new Redis({ url: backend.url, token: backend.token }),
    limiter: Ratelimit.slidingWindow(
      policy.maxRequests,
      `${policy.windowSeconds} s`,
    ),
    prefix: policy.prefix,
  })
}
