import 'server-only'

import { getServerEnv } from '../server-env'
import { createRateLimiter } from '../../rate-limit/server'
import { amaSecurityAuditSink } from './audit-server'
import { createAmaSecurity } from './service'

let security: ReturnType<typeof createAmaSecurity> | undefined

export function getAmaSecurity() {
  if (security) return security

  const environment = getServerEnv()
  const limiter = createRateLimiter(environment.rateLimitBackend, {
    prefix: 'cali:ama:admin-mutation',
    maxRequests: environment.ADMIN_MUTATION_RATE_LIMIT_MAX_REQUESTS,
    windowSeconds: environment.ADMIN_MUTATION_RATE_LIMIT_WINDOW_SECONDS,
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
