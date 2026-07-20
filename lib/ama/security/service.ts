import 'server-only'

import { createHmac } from 'node:crypto'

import {
  browserMutationDeniedResponse,
  checkBrowserMutationRequest,
  featureUnavailableResponse,
  securityDenialHeaders,
} from './request-policy'
import { createSecurityAuditRecorder } from './audit'

export type PrivilegedAuditEvent =
  | 'ama_booking.cancelled'
  | 'ama_booking.rescheduled'
  | 'ama_booking.refund_exception_granted'
  | 'ama_operation.retried'
  | 'ama_operation.resolved'
  | 'ama_time_request.resolved'
  | 'availability_mutation.succeeded'
  | 'google_connect.started'
  | 'google_callback.completed'
  | 'google_disconnect.succeeded'
  | 'admin_logout.succeeded'
  | 'media_alt_text.requested'
  | 'media_asset.archived'
  | 'media_asset.purge_requested'
  | 'media_asset.processing_resumed'
  | 'media_asset.restored'
  | 'media_asset.reviewed'
  | 'media_location_label.requested'
  | 'media_photo_selection.draft_saved'
  | 'media_photo_selection.published'
  | 'media_upload.completed'
  | 'media_upload.discarded'
  | 'media_upload.intent_created'

export type AmaFeatureFlags = {
  publicMutations: boolean
  payments: boolean
  bookingFinalization: boolean
  google: boolean
  tencent: boolean
}

export type AmaFeature = keyof AmaFeatureFlags

export type SecurityAuditEvent = {
  event:
    | 'feature.disabled'
    | 'browser_mutation.denied'
    | 'admin_authentication.denied'
    | 'admin_mutation.rate_limited'
    | 'admin_mutation.limiter_error'
    | PrivilegedAuditEvent
  timestamp: string
  outcome: 'allowed' | 'denied' | 'error'
  requestId: string
  actorId?: string
}

export interface SecurityAuditSink {
  write(event: SecurityAuditEvent): void | Promise<void>
}

export interface SecurityRateLimiter {
  limit(key: string): Promise<{ success: boolean }>
}

type AmaSecurityDependencies = {
  baseUrl: URL
  features: AmaFeatureFlags
  pseudonymKey: Buffer
  rateLimiter: SecurityRateLimiter
  audit: SecurityAuditSink
  clock?: { now(): Date }
  requestId?: () => string
  retryAfterSeconds?: number
}

function rateLimitedResponse(retryAfterSeconds: number) {
  const headers = securityDenialHeaders()
  headers.set('retry-after', String(retryAfterSeconds))
  return new Response(null, {
    status: 429,
    headers,
  })
}

export function createAmaSecurity({
  baseUrl,
  features,
  pseudonymKey,
  rateLimiter,
  audit,
  clock = { now: () => new Date() },
  requestId,
  retryAfterSeconds = 60,
}: AmaSecurityDependencies) {
  const recordAuditEvent = createSecurityAuditRecorder({
    audit,
    clock,
    requestId,
  })

  function disabledFeature(request: Request, required: readonly AmaFeature[]) {
    if (required.every((feature) => features[feature])) return null
    recordAuditEvent(request, { event: 'feature.disabled', outcome: 'denied' })
    return featureUnavailableResponse()
  }

  function privateActorId(actorId: string) {
    return createHmac('sha256', pseudonymKey).update(actorId).digest('hex')
  }

  async function protectBrowserMutation(
    request: Request,
    required: readonly AmaFeature[],
  ) {
    const disabled = disabledFeature(request, required)
    if (disabled) return disabled

    if (checkBrowserMutationRequest(request, baseUrl)) {
      recordAuditEvent(request, {
        event: 'browser_mutation.denied',
        outcome: 'denied',
      })
      return browserMutationDeniedResponse()
    }
    return null
  }

  return {
    protectFeatures(request: Request, required: readonly AmaFeature[]) {
      return disabledFeature(request, required)
    },

    protectOwnerAdminMutation(request: Request) {
      return protectBrowserMutation(request, [])
    },

    protectBrowserMutation,

    recordAuthenticationDenial(request: Request) {
      recordAuditEvent(request, {
        event: 'admin_authentication.denied',
        outcome: 'denied',
      })
    },

    recordPrivilegedAction(
      request: Request,
      action: PrivilegedAuditEvent,
      actorId: string,
    ) {
      recordAuditEvent(request, {
        event: action,
        outcome: 'allowed',
        actorId: privateActorId(actorId),
      })
    },

    async limitAdminMutation(request: Request, actorId: string) {
      const pseudonymousActorId = privateActorId(actorId)
      try {
        const result = await rateLimiter.limit(pseudonymousActorId)
        if (result.success) return null
        recordAuditEvent(request, {
          event: 'admin_mutation.rate_limited',
          outcome: 'denied',
          actorId: pseudonymousActorId,
        })
        return rateLimitedResponse(retryAfterSeconds)
      } catch {
        recordAuditEvent(request, {
          event: 'admin_mutation.limiter_error',
          outcome: 'error',
          actorId: pseudonymousActorId,
        })
        return featureUnavailableResponse(retryAfterSeconds)
      }
    },
  }
}

export type AmaSecurity = ReturnType<typeof createAmaSecurity>
