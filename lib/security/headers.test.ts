import { afterEach, describe, expect, it, vi } from 'vitest'

import { securityHeaders } from './headers'

afterEach(() => {
  vi.unstubAllEnvs()
  vi.resetModules()
})

describe('site security headers', () => {
  it('sets a restrictive browser security baseline for every route', () => {
    const headers = Object.fromEntries(
      securityHeaders.map(({ key, value }) => [key.toLowerCase(), value]),
    )

    expect(headers['content-security-policy']).toContain("default-src 'self'")
    expect(headers['content-security-policy']).toContain("frame-ancestors 'none'")
    expect(headers['content-security-policy']).toContain("object-src 'none'")
    expect(headers['content-security-policy']).toContain("base-uri 'self'")
    expect(headers['content-security-policy']).toContain("form-action 'self'")
    expect(headers['content-security-policy']).toContain("script-src 'self' 'unsafe-inline'")
    expect(headers['content-security-policy']).toContain('https://og.zolplay.com')
    expect(headers['content-security-policy']).not.toContain('https://www.google.com')
    expect(headers['content-security-policy']).not.toContain("'unsafe-eval'")
    expect(headers['strict-transport-security']).toBe(
      'max-age=63072000; includeSubDomains; preload',
    )
    expect(headers['x-frame-options']).toBe('DENY')
    expect(headers['x-content-type-options']).toBe('nosniff')
    expect(headers['referrer-policy']).toBe('strict-origin-when-cross-origin')
    expect(headers['permissions-policy']).toContain('camera=()')
    expect(headers['permissions-policy']).toContain('microphone=()')
    expect(headers['permissions-policy']).toContain('payment=()')
  })

  it('allows only the configured Bunny Media origin for images', async () => {
    vi.stubEnv(
      'BUNNY_MEDIA_CDN_URL',
      'https://media.example.com/private/path?ignored=true',
    )
    const { securityHeaders: configuredHeaders } = await import('./headers')
    const policy = configuredHeaders.find(
      ({ key }) => key === 'Content-Security-Policy',
    )?.value

    expect(policy).toContain(' https://media.example.com')
    expect(policy).not.toContain('/private/path')
    expect(policy).not.toContain('ignored=true')
  })
})
