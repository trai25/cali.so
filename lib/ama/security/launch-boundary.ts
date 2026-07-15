import { createSecurityAuditRecorder } from './audit'
import { featureUnavailableResponse } from './request-policy'
import type {
  AmaFeature,
  AmaFeatureFlags,
  SecurityAuditSink,
} from './service'

type LaunchBoundaryDependencies = {
  features: AmaFeatureFlags
  audit: SecurityAuditSink
  clock?: { now(): Date }
  requestId?: () => string
}

export function createAmaLaunchBoundary({
  features,
  audit,
  clock = { now: () => new Date() },
  requestId,
}: LaunchBoundaryDependencies) {
  const recordAuditEvent = createSecurityAuditRecorder({
    audit,
    clock,
    requestId,
  })

  return {
    protect(request: Request, required: readonly AmaFeature[]) {
      if (required.every((feature) => features[feature])) return null
      recordAuditEvent(request, {
        event: 'feature.disabled',
        outcome: 'denied',
      })
      return featureUnavailableResponse()
    },
  }
}
