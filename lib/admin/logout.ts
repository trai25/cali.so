import 'server-only'

import type { AmaSecurity } from '~/lib/ama/security/service'
import { securityDenialHeaders } from '~/lib/ama/security/request-policy'

import type { OwnerAccess } from './authorization'

type LogoutDependencies = {
  security: Pick<
    AmaSecurity,
    | 'limitAdminMutation'
    | 'protectOwnerAdminMutation'
    | 'recordAuthenticationDenial'
    | 'recordPrivilegedAction'
  >
  getAccess(): Promise<OwnerAccess>
  getSessionId(): Promise<string | null>
  revokeSession(sessionId: string): Promise<void>
}

function denied(status: 401 | 403 | 503) {
  return new Response(null, {
    status,
    headers: securityDenialHeaders(),
  })
}

export function createAdminLogoutHandler({
  security,
  getAccess,
  getSessionId,
  revokeSession,
}: LogoutDependencies) {
  return async function POST(request: Request) {
    const blocked = await security.protectOwnerAdminMutation(request)
    if (blocked) return blocked

    let access: OwnerAccess
    try {
      access = await getAccess()
    } catch {
      return denied(503)
    }
    if (access.status !== 'authorized') {
      security.recordAuthenticationDenial(request)
      return denied(access.status === 'forbidden' ? 403 : 401)
    }

    const limited = await security.limitAdminMutation(
      request,
      access.principal.actorId,
    )
    if (limited) return limited

    let sessionId: string | null
    try {
      sessionId = await getSessionId()
    } catch {
      return denied(503)
    }
    if (!sessionId) {
      security.recordAuthenticationDenial(request)
      return denied(401)
    }

    try {
      await revokeSession(sessionId)
    } catch {
      return denied(503)
    }

    security.recordPrivilegedAction(
      request,
      'admin_logout.succeeded',
      access.principal.actorId,
    )

    return new Response(null, {
      status: 303,
      headers: {
        location: new URL('/', request.url).toString(),
        'cache-control': 'no-store',
        'referrer-policy': 'no-referrer',
      },
    })
  }
}
