import { randomUUID } from 'node:crypto'

import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'

import { adminContentSecurityPolicy } from './lib/security/headers'

export function proxy(request: NextRequest) {
  const nonce = Buffer.from(randomUUID()).toString('base64')
  const policy = adminContentSecurityPolicy(nonce)
  const requestHeaders = new Headers(request.headers)
  requestHeaders.set('content-security-policy', policy)
  requestHeaders.set('x-nonce', nonce)

  const response = NextResponse.next({ request: { headers: requestHeaders } })
  response.headers.set('content-security-policy', policy)
  return response
}

export const config = {
  matcher: '/admin/:path*',
}
