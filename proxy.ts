import { randomUUID } from 'node:crypto'

import { clerkMiddleware } from '@clerk/nextjs/server'
import type { NextFetchEvent, NextRequest } from 'next/server'
import { NextResponse } from 'next/server'

import {
  isArchivedNewsletterId,
  isPublishedPostSlug,
} from './lib/public-content-routes'
import { adminContentSecurityPolicy } from './lib/security/headers'

function missingPublicContent(pathname: string) {
  const postMatch = pathname.match(/^\/(?:en\/)?blog\/([^/]+)\/?$/)
  if (postMatch) {
    const slug = postMatch[1]
    if (/^(?:opengraph-image|twitter-image)-/.test(slug)) return false
    return !isPublishedPostSlug(slug)
  }

  const newsletterMatch = pathname.match(
    /^\/(?:en\/)?newsletters\/([^/]+)\/?$/,
  )
  return newsletterMatch
    ? !isArchivedNewsletterId(newsletterMatch[1])
    : false
}

function isAdminPage(pathname: string) {
  return pathname === '/admin' || pathname.startsWith('/admin/')
}

function usesClerk(pathname: string) {
  return (
    isAdminPage(pathname) ||
    pathname === '/api/admin' ||
    pathname.startsWith('/api/admin/')
  )
}

export function siteProxy(request: NextRequest) {
  const { pathname } = request.nextUrl

  if (missingPublicContent(pathname)) {
    const notFoundUrl = request.nextUrl.clone()
    notFoundUrl.pathname = '/_not-found'
    return NextResponse.rewrite(notFoundUrl, { status: 404 })
  }

  if (!isAdminPage(pathname)) {
    return NextResponse.next()
  }

  const nonce = Buffer.from(randomUUID()).toString('base64')
  const policy = adminContentSecurityPolicy(nonce)
  const requestHeaders = new Headers(request.headers)
  requestHeaders.set('content-security-policy', policy)
  requestHeaders.set('x-nonce', nonce)

  const response = NextResponse.next({ request: { headers: requestHeaders } })
  response.headers.set('content-security-policy', policy)
  return response
}

const clerkProxy = clerkMiddleware(async (auth, request) => {
  if (isAdminPage(request.nextUrl.pathname)) await auth.protect()
  return siteProxy(request)
})

export function proxy(request: NextRequest, event: NextFetchEvent) {
  if (!usesClerk(request.nextUrl.pathname)) return siteProxy(request)
  return clerkProxy(request, event)
}

export const config = {
  matcher: [
    '/admin/:path*',
    '/api/admin/:path*',
    '/blog/:slug',
    '/en/blog/:slug',
    '/newsletters/:id',
    '/en/newsletters/:id',
  ],
}
