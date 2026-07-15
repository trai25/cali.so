import { randomUUID } from 'node:crypto'

import type { SecurityAuditEvent, SecurityAuditSink } from './service'

type SecurityAuditRecorderDependencies = {
  audit: SecurityAuditSink
  clock?: { now(): Date }
  requestId?: () => string
}

export function createSecurityAuditRecorder({
  audit,
  clock = { now: () => new Date() },
  requestId = randomUUID,
}: SecurityAuditRecorderDependencies) {
  const requestIds = new WeakMap<Request, string>()

  return function recordAuditEvent(
    request: Request,
    input: Omit<SecurityAuditEvent, 'timestamp' | 'requestId'>,
  ) {
    let currentRequestId = requestIds.get(request)
    if (!currentRequestId) {
      currentRequestId = requestId()
      requestIds.set(request, currentRequestId)
    }

    const event = {
      ...input,
      timestamp: clock.now().toISOString(),
      requestId: currentRequestId,
    }
    try {
      const result = audit.write(event)
      if (result instanceof Promise) void result.catch(() => {})
    } catch {
      // Security logging must never turn a denial into an availability incident.
    }
  }
}
