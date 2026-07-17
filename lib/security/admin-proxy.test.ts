import { clerkMiddleware } from '@clerk/nextjs/server'
import { NextRequest } from 'next/server'
import type { NextFetchEvent } from 'next/server'
import { afterAll, describe, expect, it, vi } from 'vitest'

const previousClerkEnvironment = vi.hoisted(() => {
  const previous = {
    encryptionKey: process.env.CLERK_ENCRYPTION_KEY,
    publishableKey: process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY,
    secretKey: process.env.CLERK_SECRET_KEY,
  }
  process.env.CLERK_SECRET_KEY = 'sk_live_ci_secret_not_real'
  process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY =
    'pk_live_Y2xlcmsuY2FsaS5zbyQ'
  process.env.CLERK_ENCRYPTION_KEY = 'ci-clerk-middleware-encryption-key'
  return previous
})

import { siteProxy } from '../../proxy'

const throughRealClerkMiddleware = clerkMiddleware((_auth, request) =>
  siteProxy(request),
)

const event = {
  passThroughOnException() {},
  waitUntil() {},
} as unknown as NextFetchEvent

afterAll(() => {
  for (const [name, value] of [
    ['CLERK_ENCRYPTION_KEY', previousClerkEnvironment.encryptionKey],
    [
      'NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY',
      previousClerkEnvironment.publishableKey,
    ],
    ['CLERK_SECRET_KEY', previousClerkEnvironment.secretKey],
  ] as const) {
    if (value === undefined) delete process.env[name]
    else process.env[name] = value
  }
})

describe('admin CSP proxy', () => {
  it('allows Clerk to keep the browser session synchronized', () => {
    const previousPublishableKey =
      process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
    process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY =
      'pk_live_Y2xlcmsuY2FsaS5zbyQ'

    try {
      const policy = siteProxy(
        new NextRequest('https://cali.so/admin/media'),
      ).headers.get('content-security-policy')

      expect(policy).toContain("connect-src 'self' https://clerk.cali.so")
    } finally {
      if (previousPublishableKey === undefined) {
        delete process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
      } else {
        process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY = previousPublishableKey
      }
    }
  })

  it('uses a fresh strict nonce policy for each admin render', () => {
    const request = new NextRequest('https://cali.so/admin/login')
    const first = siteProxy(request).headers.get('content-security-policy')
    const second = siteProxy(request).headers.get('content-security-policy')

    expect(first).toMatch(
      /script-src 'self' 'nonce-[^']+' 'sha256-[^']+' 'strict-dynamic'/,
    )
    expect(first).not.toContain("script-src 'self' 'unsafe-inline'")
    expect(first?.match(/'sha256-[^']+'/g)).toHaveLength(1)
    expect(first).toContain("style-src 'self' 'unsafe-inline'")
    expect(first).not.toBe(second)
  })

  it('preserves the strict nonce policy through the real Clerk middleware', async () => {
    const response = await throughRealClerkMiddleware(
      new NextRequest('https://cali.so/admin/photos'),
      event,
    )
    const policy = response?.headers.get('content-security-policy')

    expect(policy).toMatch(
      /script-src 'self' 'nonce-[^']+' 'sha256-[^']+' 'strict-dynamic'/,
    )
    expect(response?.headers.get('x-middleware-request-x-nonce')).toBeTruthy()
    expect(
      response?.headers.get('x-middleware-request-content-security-policy'),
    ).toBe(policy)
  })
})
