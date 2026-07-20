import { describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

import type { AmaSecurity } from '~/lib/ama/security/service'

import { createAdminLogoutHandler } from './logout'

function request(origin = 'https://cali.so') {
  return new Request('https://cali.so/api/admin/auth/logout', {
    method: 'POST',
    headers: {
      origin,
      'sec-fetch-site':
        origin === 'https://cali.so' ? 'same-origin' : 'cross-site',
    },
  })
}

function fixture(input?: {
  access?:
    | { status: 'authorized'; principal: { id: string; actorId: string } }
    | { status: 'forbidden' }
    | { status: 'unauthenticated' }
  blocked?: Response | null
  getAccess?: () => Promise<never>
  getSessionId?: () => Promise<never>
  limited?: Response | null
  sessionId?: string | null
  revoke?: () => Promise<void>
}) {
  const recordAuthenticationDenial = vi.fn()
  const recordPrivilegedAction = vi.fn()
  const limitAdminMutation = vi.fn(async () => input?.limited ?? null)
  const protectOwnerAdminMutation = vi.fn(async () => input?.blocked ?? null)
  const revokeSession = vi.fn(input?.revoke ?? (async () => undefined))
  const handler = createAdminLogoutHandler({
    security: {
      limitAdminMutation,
      protectOwnerAdminMutation,
      recordAuthenticationDenial,
      recordPrivilegedAction,
    } as Pick<
      AmaSecurity,
      | 'limitAdminMutation'
      | 'protectOwnerAdminMutation'
      | 'recordAuthenticationDenial'
      | 'recordPrivilegedAction'
    >,
    async getAccess() {
      if (input?.getAccess) return input.getAccess()
      return input?.access ?? {
        status: 'authorized',
        principal: { id: 'owner@example.com', actorId: 'user_owner' },
      }
    },
    async getSessionId() {
      if (input?.getSessionId) return input.getSessionId()
      return input?.sessionId === undefined ? 'sess_active' : input.sessionId
    },
    revokeSession,
  })
  return {
    handler,
    limitAdminMutation,
    protectOwnerAdminMutation,
    recordAuthenticationDenial,
    recordPrivilegedAction,
    revokeSession,
  }
}

describe('Clerk admin logout', () => {
  it('rejects cross-origin requests before authentication', async () => {
    const blocked = new Response(null, { status: 403 })
    const { handler, limitAdminMutation, revokeSession } = fixture({ blocked })

    expect((await handler(request('https://attacker.example'))).status).toBe(403)
    expect(limitAdminMutation).not.toHaveBeenCalled()
    expect(revokeSession).not.toHaveBeenCalled()
  })

  it.each([
    [{ status: 'unauthenticated' as const }, 401],
    [{ status: 'forbidden' as const }, 403],
  ])('returns the correct denial for %o', async (access, status) => {
    const { handler, recordAuthenticationDenial, revokeSession } = fixture({
      access,
    })

    expect((await handler(request())).status).toBe(status)
    expect(recordAuthenticationDenial).toHaveBeenCalledOnce()
    expect(revokeSession).not.toHaveBeenCalled()
  })

  it('returns the limiter response without revoking the session', async () => {
    const limited = new Response(null, { status: 429 })
    const { handler, limitAdminMutation, revokeSession } = fixture({ limited })

    expect((await handler(request())).status).toBe(429)
    expect(limitAdminMutation).toHaveBeenCalledWith(
      expect.any(Request),
      'user_owner',
    )
    expect(revokeSession).not.toHaveBeenCalled()
  })

  it('rejects an authorized user without an active Clerk session', async () => {
    const { handler, recordAuthenticationDenial, revokeSession } = fixture({
      sessionId: null,
    })

    expect((await handler(request())).status).toBe(401)
    expect(recordAuthenticationDenial).toHaveBeenCalledOnce()
    expect(revokeSession).not.toHaveBeenCalled()
  })

  it('revokes exactly the active session and records success', async () => {
    const { handler, revokeSession, recordPrivilegedAction } = fixture()

    const response = await handler(request())

    expect(response.status).toBe(303)
    expect(response.headers.get('location')).toBe('https://cali.so/')
    expect(revokeSession).toHaveBeenCalledExactlyOnceWith('sess_active')
    expect(recordPrivilegedAction).toHaveBeenCalledWith(
      expect.any(Request),
      'admin_logout.succeeded',
      'user_owner',
    )
  })

  it('fails closed when Clerk session revocation fails', async () => {
    const { handler, recordPrivilegedAction } = fixture({
      revoke: async () => {
        throw new Error('private provider error')
      },
    })

    const response = await handler(request())

    expect(response.status).toBe(503)
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(recordPrivilegedAction).not.toHaveBeenCalled()
  })

  it.each(['access', 'session'] as const)(
    'fails closed when the Clerk %s lookup fails',
    async (dependency) => {
      const failure = async () => {
        throw new Error('private Clerk error')
      }
      const { handler, recordPrivilegedAction, revokeSession } = fixture(
        dependency === 'access'
          ? { getAccess: failure }
          : { getSessionId: failure },
      )

      const response = await handler(request())

      expect(response.status).toBe(503)
      expect(response.headers.get('cache-control')).toBe('no-store')
      expect(recordPrivilegedAction).not.toHaveBeenCalled()
      expect(revokeSession).not.toHaveBeenCalled()
    },
  )
})
