import { randomUUID } from 'node:crypto'

import { featureUnavailableResponse } from './request-policy'
import type {
  AmaFeature,
  AmaFeatureFlags,
  SecurityAuditEvent,
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
  requestId = randomUUID,
}: LaunchBoundaryDependencies) {
  const requestIds = new WeakMap<Request, string>()

  function record(event: SecurityAuditEvent) {
    try {
      const result = audit.write(event)
      if (result instanceof Promise) void result.catch(() => {})
    } catch {
      // A failed audit sink cannot turn a fail-closed boundary into an outage.
    }
  }

  return {
    protect(request: Request, required: readonly AmaFeature[]) {
      if (required.every((feature) => features[feature])) return null
      let currentRequestId = requestIds.get(request)
      if (!currentRequestId) {
        currentRequestId = requestId()
        requestIds.set(request, currentRequestId)
      }
      record({
        event: 'feature.disabled',
        timestamp: clock.now().toISOString(),
        outcome: 'denied',
        requestId: currentRequestId,
      })
      return featureUnavailableResponse()
    },
  }
}
