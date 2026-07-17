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

  it('allows a same-provider model fallback', () => {
    expect(
      parseMediaAltTextEnv({
        MEDIA_ALT_TEXT_PRIMARY_MODEL: 'openai/gpt-5.6-luna',
        MEDIA_ALT_TEXT_FALLBACK_MODEL: 'openai/gpt-5.4-mini',
      }),
    ).toMatchObject({
      primaryModel: 'openai/gpt-5.6-luna',
      fallbackModel: 'openai/gpt-5.4-mini',
    })
  })

  it('keeps every environment disabled until provider policy approval', () => {
    expect(() =>
      parseMediaAltTextEnv({
        MEDIA_ALT_TEXT_ENABLED: 'true',
        VERCEL_ENV: 'preview',
      }),
    ).toThrow('MEDIA_ALT_TEXT_PROVIDER_POLICY_APPROVED')
    expect(
      parseMediaAltTextEnv({
        MEDIA_ALT_TEXT_ENABLED: 'true',
        MEDIA_ALT_TEXT_PROVIDER_POLICY_APPROVED: 'true',
        VERCEL_ENV: 'preview',
      }).enabled,
    ).toBe(true)
  })

  it('rejects any deviation from the AI Gateway policy constants', () => {
    expect(() =>
      parseMediaAltTextEnv({ MEDIA_ALT_TEXT_TIMEOUT_MS: '11999' }),
    ).toThrow(
      'MEDIA_ALT_TEXT_TIMEOUT_MS: Must be 12000 (AI Gateway policy)',
    )
    expect(() =>
      parseMediaAltTextEnv({ MEDIA_ALT_TEXT_MAX_RETRIES: '2' }),
    ).toThrow('MEDIA_ALT_TEXT_MAX_RETRIES: Must be 1 (AI Gateway policy)')
    expect(() =>
      parseMediaAltTextEnv({
        MEDIA_ALT_TEXT_RATE_LIMIT_MAX_REQUESTS: '11',
      }),
    ).toThrow(
      'MEDIA_ALT_TEXT_RATE_LIMIT_MAX_REQUESTS: Must be 10 (owner rate-limit policy)',
    )
    expect(() =>
      parseMediaAltTextEnv({
        MEDIA_ALT_TEXT_RATE_LIMIT_WINDOW_SECONDS: '3599',
      }),
    ).toThrow(
      'MEDIA_ALT_TEXT_RATE_LIMIT_WINDOW_SECONDS: Must be 3600 (owner rate-limit policy)',
    )
  })

  it('requires Vercel OIDC in deployed environments', () => {
    expect(() =>
      parseMediaAltTextEnv({
        VERCEL_ENV: 'preview',
        AI_GATEWAY_API_KEY: 'static-key',
      }),
    ).toThrow('AI_GATEWAY_API_KEY')
    expect(() =>
      parseMediaAltTextEnv({
        VERCEL_ENV: 'production',
        AI_GATEWAY_API_KEY: 'static-key',
      }),
    ).toThrow('AI_GATEWAY_API_KEY')
    expect(() =>
      parseMediaAltTextEnv({
        NODE_ENV: 'production',
        AI_GATEWAY_API_KEY: 'static-key',
      }),
    ).toThrow('AI_GATEWAY_API_KEY')
    expect(
      parseMediaAltTextEnv({
        NODE_ENV: 'development',
        VERCEL_ENV: 'development',
        AI_GATEWAY_API_KEY: 'local-key',
      }).enabled,
    ).toBe(false)
    expect(
      parseMediaAltTextEnv({
        NODE_ENV: 'test',
        AI_GATEWAY_API_KEY: 'ci-key',
      }).enabled,
    ).toBe(false)
  })
})
