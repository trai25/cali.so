import { describe, expect, it } from 'vitest'

import {
  DEFAULT_MEDIA_ALT_TEXT_FALLBACK_MODEL,
  DEFAULT_MEDIA_ALT_TEXT_PRIMARY_MODEL,
  parseMediaAltTextEnv,
} from './config'

describe('Media Library Alt Text environment', () => {
  it('uses live-verified vision model defaults with bounded execution', () => {
    expect(parseMediaAltTextEnv({})).toEqual({
      enabled: false,
      primaryModel: DEFAULT_MEDIA_ALT_TEXT_PRIMARY_MODEL,
      fallbackModel: DEFAULT_MEDIA_ALT_TEXT_FALLBACK_MODEL,
      timeoutMs: 12_000,
      maxRetries: 1,
      rateLimitMaxRequests: 10,
      rateLimitWindowSeconds: 3_600,
      providerPolicyApproved: false,
    })
  })

  it('requires a cross-provider fallback', () => {
    expect(() =>
      parseMediaAltTextEnv({
        MEDIA_ALT_TEXT_PRIMARY_MODEL: 'google/gemini-3.1-flash-lite',
        MEDIA_ALT_TEXT_FALLBACK_MODEL: 'google/gemini-3-flash',
      }),
    ).toThrow('MEDIA_ALT_TEXT_FALLBACK_MODEL')
  })

  it('keeps production disabled until provider policy approval', () => {
    expect(() =>
      parseMediaAltTextEnv({
        MEDIA_ALT_TEXT_ENABLED: 'true',
        VERCEL_ENV: 'production',
      }),
    ).toThrow('MEDIA_ALT_TEXT_PROVIDER_POLICY_APPROVED')
    expect(
      parseMediaAltTextEnv({
        MEDIA_ALT_TEXT_ENABLED: 'true',
        MEDIA_ALT_TEXT_PROVIDER_POLICY_APPROVED: 'true',
        VERCEL_ENV: 'production',
      }).enabled,
    ).toBe(true)
  })

  it('rejects excessive timeouts and retries', () => {
    expect(() =>
      parseMediaAltTextEnv({ MEDIA_ALT_TEXT_TIMEOUT_MS: '30001' }),
    ).toThrow('MEDIA_ALT_TEXT_TIMEOUT_MS')
    expect(() =>
      parseMediaAltTextEnv({ MEDIA_ALT_TEXT_MAX_RETRIES: '3' }),
    ).toThrow('MEDIA_ALT_TEXT_MAX_RETRIES')
    expect(() =>
      parseMediaAltTextEnv({
        MEDIA_ALT_TEXT_RATE_LIMIT_WINDOW_SECONDS: '30',
      }),
    ).toThrow('MEDIA_ALT_TEXT_RATE_LIMIT_WINDOW_SECONDS')
  })
})
