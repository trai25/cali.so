import 'server-only'

import { createHmac, randomUUID } from 'node:crypto'

import { AUTH_SESSION_COOKIE } from '../auth/service'
import { readRequestCookie } from '../cookies'
import {
  browserMutationDeniedResponse,
  checkBrowserMutationRequest,
  securityDenialHeaders,
} from './request-policy'

export type PrivilegedAuditEvent =
  | 'availability_mutation.succeeded'
  | 'google_connect.started'
  | 'google_callback.completed'
  | 'google_disconnect.succeeded'
  | 'admin_logout.succeeded'
  | 'media_alt_text.requested'
  | 'media_asset.archived'
  | 'media_asset.purge_requested'
  | 'media_asset.restored'
  | 'media_asset.reviewed'
  | 'media_upload.completed'
  | 'media_upload.intent_created'

export type AmaFeatureFlags = {
  publicMutations: boolean
  payments: boolean
  bookingFinalization: boolean
  admin: boolean
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
    | 'auth_request.failed'
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

function unavailableResponse(retryAfterSeconds?: number) {
  const headers = securityDenialHeaders()
  if (retryAfterSeconds) headers.set('retry-after', String(retryAfterSeconds))
  return new Response(null, { status: 503, headers })
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
  requestId = randomUUID,
  retryAfterSeconds = 60,
}: AmaSecurityDependencies) {
  const requestIds = new WeakMap<Request, string>()

  function record(event: SecurityAuditEvent) {
    try {
      const result = audit.write(event)
      if (result instanceof Promise) void result.catch(() => {})
    } catch {
      // Security logging must never turn a denial into an availability incident.
    }
  }

  function recordAuditEvent(
    request: Request,
    input: Omit<SecurityAuditEvent, 'timestamp' | 'requestId'>,
  ) {
    let currentRequestId = requestIds.get(request)
    if (!currentRequestId) {
      currentRequestId = requestId()
      requestIds.set(request, currentRequestId)
    }
    record({
      ...input,
      timestamp: clock.now().toISOString(),
      requestId: currentRequestId,
    })
  }

  function disabledFeature(request: Request, required: readonly AmaFeature[]) {
    if (required.every((feature) => features[feature])) return null
    recordAuditEvent(request, { event: 'feature.disabled', outcome: 'denied' })
    return unavailableResponse()
  }

  function actorId(request: Request) {
    const session =
      readRequestCookie(request, AUTH_SESSION_COOKIE) ?? 'missing-admin-session'
    return createHmac('sha256', pseudonymKey).update(session).digest('hex')
  }

  return {
    protectFeatures(request: Request, required: readonly AmaFeature[]) {
      return disabledFeature(request, required)
    },

    async protectBrowserMutation(request: Request, required: readonly AmaFeature[]) {
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
    },

    recordAuthenticationDenial(request: Request) {
      recordAuditEvent(request, {
        event: 'admin_authentication.denied',
        outcome: 'denied',
      })
    },

    recordAuthRequestFailure(request: Request) {
      recordAuditEvent(request, {
        event: 'auth_request.failed',
        outcome: 'error',
      })
    },

    recordPrivilegedAction(request: Request, action: PrivilegedAuditEvent) {
      recordAuditEvent(request, {
        event: action,
        outcome: 'allowed',
        actorId: actorId(request),
      })
    },

    async limitAdminMutation(request: Request) {
      const privateActorId = actorId(request)
      try {
        const result = await rateLimiter.limit(privateActorId)
        if (result.success) return null
        recordAuditEvent(request, {
          event: 'admin_mutation.rate_limited',
          outcome: 'denied',
          actorId: privateActorId,
        })
        return rateLimitedResponse(retryAfterSeconds)
      } catch {
        recordAuditEvent(request, {
          event: 'admin_mutation.limiter_error',
          outcome: 'error',
          actorId: privateActorId,
        })
        return unavailableResponse(retryAfterSeconds)
      }
    },
  }
}

export type AmaSecurity = ReturnType<typeof createAmaSecurity>
