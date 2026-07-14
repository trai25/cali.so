import {
  AUTH_SESSION_COOKIE,
  SESSION_LIFETIME_SECONDS,
  type OwnerAuth,
} from './service'

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
  const forwarded = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
  return forwarded || request.headers.get('x-real-ip') || 'unknown'
}

function readCookie(request: Request, name: string) {
  const cookie = request.headers.get('cookie')
  if (!cookie) return undefined
  for (const item of cookie.split(';')) {
    const separator = item.indexOf('=')
    if (separator === -1) continue
    if (item.slice(0, separator).trim() === name) return item.slice(separator + 1).trim()
  }
  return undefined
}

export function authenticateOwnerRequest(auth: OwnerAuth, request: Request) {
  return auth.authenticate(readCookie(request, AUTH_SESSION_COOKIE))
}

export function createMagicLinkRequestHandler(
  auth: OwnerAuth,
  defer: Defer = (task) => task(),
) {
  return async function POST(request: Request) {
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
        console.error('AMA magic-link request failed')
      }
    })

    return redirect(auth.url('/admin/login?sent=1'))
  }
}

export function createMagicLinkVerifyHandler(auth: OwnerAuth) {
  return async function GET(request: Request) {
    const token = new URL(request.url).searchParams.get('token')
    const session = await auth.verifyMagicToken(token)
    if (!session) return redirect(auth.url('/admin/login?error=invalid-link'))
    return redirect(auth.url('/admin'), sessionCookie(session))
  }
}

export function createLogoutHandler(auth: OwnerAuth) {
  return async function POST(request: Request) {
    await auth.logout(readCookie(request, AUTH_SESSION_COOKIE))
    return redirect(auth.url('/admin/login'), sessionCookie('', 0))
  }
}
