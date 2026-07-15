import 'server-only'

import { getAmaFeatures } from '../server-env'
import { amaSecurityAuditSink } from './audit-server'
import { createAmaLaunchBoundary } from './launch-boundary'
import type { AmaFeature } from './service'

let boundary: ReturnType<typeof createAmaLaunchBoundary> | undefined

export function protectAmaLaunchBoundary(
  request: Request,
  required: readonly AmaFeature[],
) {
  boundary ??= createAmaLaunchBoundary({
    features: getAmaFeatures(),
    audit: amaSecurityAuditSink,
  })
  return boundary.protect(request, required)
}
