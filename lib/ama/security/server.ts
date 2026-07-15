import 'server-only'

import { Ratelimit } from '@upstash/ratelimit'
import { Redis } from '@upstash/redis'

import { getServerEnv } from '../server-env'
import { amaSecurityAuditSink } from './audit-server'
import { createAmaSecurity } from './service'

let security: ReturnType<typeof createAmaSecurity> | undefined

export function getAmaSecurity() {
  if (security) return security

  const environment = getServerEnv()
  const redis = new Redis({
    url: environment.UPSTASH_REDIS_REST_URL,
    token: environment.UPSTASH_REDIS_REST_TOKEN,
  })
  const limiter = new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(
      environment.ADMIN_MUTATION_RATE_LIMIT_MAX_REQUESTS,
      `${environment.ADMIN_MUTATION_RATE_LIMIT_WINDOW_SECONDS} s`,
    ),
    prefix: 'cali:ama:admin-mutation',
  })

  security = createAmaSecurity({
    baseUrl: environment.SITE_URL,
    features: environment.features,
    pseudonymKey: Buffer.from(environment.RATE_LIMIT_HASH_KEY, 'base64'),
    rateLimiter: limiter,
    retryAfterSeconds: environment.ADMIN_MUTATION_RATE_LIMIT_WINDOW_SECONDS,
    audit: amaSecurityAuditSink,
  })
  return security
}
