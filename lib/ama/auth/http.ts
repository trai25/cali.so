import {
  AUTH_SESSION_COOKIE,
  SESSION_LIFETIME_SECONDS,
  type OwnerAuth,
} from './service'
import { readRequestCookie } from '../cookies'
import type { AmaSecurity } from '../security/service'

type Defer = (task: () => Promise<void>) => void | Promise<void>

function redirect(location: URL, setCookie?: string) {
  const headers = new Headers({
    location: location.toString(),
    'cache-control': 'no-store',
    'referrer-policy': 'no-referrer',
  })
  if (setCookie) headers.set('set-cookie', setCookie)
  return new Response(null, { status: 303, headers })
}

function sessionCookie(value: string, maxAge = SESSION_LIFETIME_SECONDS) {
  return [
    `${AUTH_SESSION_COOKIE}=${value}`,
    `Max-Age=${maxAge}`,
    'Path=/',
    'HttpOnly',
    'Secure',
    'SameSite=Lax',
  ].join('; ')
}

function requestKey(request: Request) {
  if (!request.headers.has('x-vercel-id')) return 'untrusted-proxy'
  const forwarded = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
  return forwarded || 'unknown-vercel-client'
}

export function authenticateOwnerRequest(auth: OwnerAuth, request: Request) {
  return auth.authenticate(readRequestCookie(request, AUTH_SESSION_COOKIE))
}

export function createMagicLinkRequestHandler(
  auth: OwnerAuth,
  security: AmaSecurity,
  defer: Defer = (task) => task(),
) {
  return async function POST(request: Request) {
    const blocked = await security.protectBrowserMutation(request, ['admin'])
    if (blocked) return blocked

    let email = ''
    try {
      const formData = await request.formData()
      const value = formData.get('email')
      email = typeof value === 'string' ? value : ''
    } catch {
      // Keep malformed input on the same non-enumerating response path.
    }

    await defer(async () => {
      try {
        await auth.requestMagicLink(email, requestKey(request))
      } catch {
        security.recordAuthRequestFailure(request)
      }
    })

    return redirect(auth.url('/admin/login?sent=1'))
  }
}

export function createMagicLinkVerifyHandler(auth: OwnerAuth, security: AmaSecurity) {
  return async function GET(request: Request) {
    const blocked = security.protectFeatures(request, ['admin'])
    if (blocked) return blocked

    const token = new URL(request.url).searchParams.get('token')
    const session = await auth.verifyMagicToken(token)
    if (!session) return redirect(auth.url('/admin/login?error=invalid-link'))
    return redirect(auth.url('/admin'), sessionCookie(session))
  }
}

export function createLogoutHandler(auth: OwnerAuth, security: AmaSecurity) {
  return async function POST(request: Request) {
    const blocked = await security.protectBrowserMutation(request, [])
    if (blocked) return blocked

    const session = readRequestCookie(request, AUTH_SESSION_COOKIE)
    if (await auth.authenticate(session)) {
      const limited = await security.limitAdminMutation(request)
      if (limited) return limited

      await auth.logout(session)
      security.recordPrivilegedAction(request, 'admin_logout.succeeded')
    } else {
      security.recordAuthenticationDenial(request)
    }
    return redirect(auth.url('/admin/login'), sessionCookie('', 0))
  }
}
