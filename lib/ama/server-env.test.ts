import { describe, expect, it } from 'vitest'

import { parseAmaFeatures, parseServerEnv } from './server-env-schema'

const validEnvironment = {
  DATABASE_URL: 'postgresql://user:password@example.neon.tech/site',
  ADMIN_EMAIL: 'owner@example.com',
  AMA_ENCRYPTION_KEY: Buffer.alloc(32).toString('base64'),
  RATE_LIMIT_HASH_KEY: Buffer.alloc(32, 2).toString('base64'),
  GOOGLE_CLIENT_ID: 'google-client-id.apps.googleusercontent.com',
  GOOGLE_CLIENT_SECRET: 'google-client-secret',
  UPSTASH_REDIS_REST_URL: 'https://example.upstash.io',
  UPSTASH_REDIS_REST_TOKEN: 'redis-secret',
  SITE_URL: 'https://cali.so',
  VERCEL_ENV: 'production',
}

describe('AMA server environment', () => {
  it('reads disabled launch switches without private configuration', () => {
    expect(parseAmaFeatures({})).toEqual({
      publicMutations: false,
      payments: false,
      bookingFinalization: false,
      google: false,
      tencent: false,
    })
  })

  it('rejects ambiguous launch switches before private services initialize', () => {
    expect(() =>
      parseAmaFeatures({ AMA_GOOGLE_INTEGRATION_ENABLED: 'yes' }),
    ).toThrowError(/AMA_GOOGLE_INTEGRATION_ENABLED/)
  })

  it('accepts the complete server-only configuration', () => {
    const environment = parseServerEnv(validEnvironment)

    expect(environment.ADMIN_EMAIL).toBe('owner@example.com')
    expect(environment.ADMIN_MUTATION_RATE_LIMIT_MAX_REQUESTS).toBe(30)
    expect(environment.rateLimitBackend).toEqual({
      kind: 'upstash',
      url: 'https://example.upstash.io',
      token: 'redis-secret',
    })
    expect(environment.features).toEqual({
      publicMutations: false,
      payments: false,
      bookingFinalization: false,
      google: false,
      tencent: false,
    })
  })

  it('does not require Google credentials while Google is disabled', () => {
    const {
      GOOGLE_CLIENT_ID: _clientId,
      GOOGLE_CLIENT_SECRET: _clientSecret,
      ...withoutGoogle
    } = validEnvironment

    expect(parseServerEnv(withoutGoogle).features.google).toBe(false)
  })

  it('accepts Vercel Marketplace Redis aliases', () => {
    const {
      UPSTASH_REDIS_REST_URL: _upstashUrl,
      UPSTASH_REDIS_REST_TOKEN: _upstashToken,
      ...withoutUpstash
    } = validEnvironment
    const environment = parseServerEnv({
      ...withoutUpstash,
      KV_REST_API_URL: 'https://marketplace.upstash.io',
      KV_REST_API_TOKEN: 'marketplace-secret',
    })

    expect(environment.rateLimitBackend).toEqual({
      kind: 'upstash',
      url: 'https://marketplace.upstash.io',
      token: 'marketplace-secret',
    })
    expect(environment).not.toHaveProperty('UPSTASH_REDIS_REST_URL')
    expect(environment).not.toHaveProperty('UPSTASH_REDIS_REST_TOKEN')
    expect(environment).not.toHaveProperty('KV_REST_API_URL')
    expect(environment).not.toHaveProperty('KV_REST_API_TOKEN')
  })

  it('prefers native Upstash credentials when both pairs are complete', () => {
    const environment = parseServerEnv({
      ...validEnvironment,
      KV_REST_API_URL: 'https://marketplace.upstash.io',
      KV_REST_API_TOKEN: 'marketplace-secret',
    })

    expect(environment.rateLimitBackend).toEqual({
      kind: 'upstash',
      url: validEnvironment.UPSTASH_REDIS_REST_URL,
      token: validEnvironment.UPSTASH_REDIS_REST_TOKEN,
    })
  })

  it('uses the database rate limiter in Preview without Redis credentials', () => {
    const {
      UPSTASH_REDIS_REST_URL: _upstashUrl,
      UPSTASH_REDIS_REST_TOKEN: _upstashToken,
      ...withoutUpstash
    } = validEnvironment

    expect(
      parseServerEnv({ ...withoutUpstash, VERCEL_ENV: 'preview' })
        .rateLimitBackend,
    ).toEqual({ kind: 'database' })
  })

  it('ignores transitional Redis credentials outside Production', () => {
    const {
      UPSTASH_REDIS_REST_URL: _upstashUrl,
      UPSTASH_REDIS_REST_TOKEN: _upstashToken,
      ...withoutUpstash
    } = validEnvironment
    const previewEnvironment = parseServerEnv({
      ...withoutUpstash,
      VERCEL_ENV: 'preview',
      KV_REST_API_URL: 'https://marketplace.upstash.io',
      KV_REST_API_TOKEN: 'marketplace-secret',
      KV_REST_API_READ_ONLY_TOKEN: 'marketplace-read-only-secret',
      KV_URL: 'redis://default:secret@example.upstash.io:6379',
      REDIS_URL: 'redis://default:secret@example.upstash.io:6379',
    })

    expect(previewEnvironment.rateLimitBackend).toEqual({ kind: 'database' })
    for (const field of [
      'KV_REST_API_URL',
      'KV_REST_API_TOKEN',
      'KV_REST_API_READ_ONLY_TOKEN',
      'KV_URL',
      'REDIS_URL',
    ]) {
      expect(previewEnvironment).not.toHaveProperty(field)
    }

    expect(
      parseServerEnv({ ...validEnvironment, VERCEL_ENV: 'development' })
        .rateLimitBackend,
    ).toEqual({ kind: 'memory' })
  })

  it('uses an in-memory rate limiter outside Vercel', () => {
    const {
      UPSTASH_REDIS_REST_URL: _upstashUrl,
      UPSTASH_REDIS_REST_TOKEN: _upstashToken,
      VERCEL_ENV: _vercelEnvironment,
      ...localEnvironment
    } = validEnvironment

    expect(parseServerEnv(localEnvironment).rateLimitBackend).toEqual({
      kind: 'memory',
    })
  })

  it('rejects partial Redis credential pairs', () => {
    const {
      UPSTASH_REDIS_REST_URL: _upstashUrl,
      UPSTASH_REDIS_REST_TOKEN: _upstashToken,
      ...withoutUpstash
    } = validEnvironment

    expect(() =>
      parseServerEnv({
        ...withoutUpstash,
        KV_REST_API_URL: 'https://marketplace.upstash.io',
      }),
    ).toThrowError(/KV_REST_API_TOKEN/)

    const { UPSTASH_REDIS_REST_TOKEN: _missingToken, ...partialUpstash } =
      validEnvironment
    expect(() =>
      parseServerEnv({
        ...partialUpstash,
        KV_REST_API_URL: 'https://marketplace.upstash.io',
        KV_REST_API_TOKEN: 'marketplace-secret',
      }),
    ).toThrowError(/UPSTASH_REDIS_REST_TOKEN/)

    for (const partialPair of [
      { UPSTASH_REDIS_REST_URL: 'https://example.upstash.io' },
      { UPSTASH_REDIS_REST_TOKEN: 'partial-secret' },
      { KV_REST_API_TOKEN: 'partial-secret' },
      {
        UPSTASH_REDIS_REST_URL: 'https://example.upstash.io',
        KV_REST_API_TOKEN: 'partial-secret',
      },
      {
        UPSTASH_REDIS_REST_TOKEN: 'partial-secret',
        KV_REST_API_URL: 'https://marketplace.upstash.io',
      },
    ]) {
      expect(() =>
        parseServerEnv({ ...withoutUpstash, ...partialPair }),
      ).toThrow()
    }
  })

  it('rejects missing or non-HTTPS Redis configuration', () => {
    const {
      UPSTASH_REDIS_REST_URL: _upstashUrl,
      UPSTASH_REDIS_REST_TOKEN: _upstashToken,
      ...withoutUpstash
    } = validEnvironment

    expect(() => parseServerEnv(withoutUpstash)).toThrowError(
      /UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN/,
    )
    expect(() =>
      parseServerEnv({
        ...validEnvironment,
        UPSTASH_REDIS_REST_URL: 'http://example.upstash.io',
      }),
    ).toThrowError(/UPSTASH_REDIS_REST_URL/)
    expect(() =>
      parseServerEnv({
        ...validEnvironment,
        UPSTASH_REDIS_REST_URL: 'not-a-url',
      }),
    ).toThrowError(/UPSTASH_REDIS_REST_URL/)
    expect(() =>
      parseServerEnv({
        ...validEnvironment,
        UPSTASH_REDIS_REST_TOKEN: '   ',
      }),
    ).toThrowError(/UPSTASH_REDIS_REST_TOKEN/)
    expect(() =>
      parseServerEnv({
        ...withoutUpstash,
        KV_REST_API_URL: 'http://marketplace.upstash.io',
        KV_REST_API_TOKEN: 'do-not-print-me',
      }),
    ).toThrowError(/KV_REST_API_URL/)
    expect(() =>
      parseServerEnv({
        ...withoutUpstash,
        KV_REST_API_URL: 'https://marketplace.upstash.io',
        KV_REST_API_TOKEN: '   ',
      }),
    ).toThrowError(/KV_REST_API_TOKEN/)

    try {
      parseServerEnv({
        ...withoutUpstash,
        KV_REST_API_URL: 'http://marketplace.upstash.io',
        KV_REST_API_TOKEN: 'do-not-print-me',
      })
    } catch (error) {
      expect(String(error)).not.toContain('do-not-print-me')
      expect(String(error)).not.toContain('marketplace.upstash.io')
    }
  })

  it('enables each sensitive feature only through an explicit switch', () => {
    const environment = parseServerEnv({
      ...validEnvironment,
      AMA_PUBLIC_MUTATIONS_ENABLED: 'true',
      AMA_PAYMENTS_ENABLED: 'true',
      AMA_BOOKING_FINALIZATION_ENABLED: 'true',
      AMA_GOOGLE_INTEGRATION_ENABLED: 'true',
      AMA_TENCENT_INTEGRATION_ENABLED: 'true',
      STRIPE_SECRET_KEY: 'sk_test_secret',
      STRIPE_WEBHOOK_SECRET: 'whsec_secret',
      RESEND_API_KEY: 're_secret',
      AMA_EMAIL_FROM: 'Cali Castle <ama@cali.so>',
      TENCENT_MEETING_MCP_URL: 'https://mcp.example.com/tencent',
      TENCENT_MEETING_MCP_TOKEN: 'tencent-token',
    })

    expect(environment.features).toEqual({
      publicMutations: true,
      payments: true,
      bookingFinalization: true,
      google: true,
      tencent: true,
    })
  })

  it('rejects ambiguous feature-switch values', () => {
    expect(() =>
      parseServerEnv({
        ...validEnvironment,
        AMA_GOOGLE_INTEGRATION_ENABLED: 'yes',
      }),
    ).toThrowError(/AMA_GOOGLE_INTEGRATION_ENABLED/)
  })

  it('rejects migration credentials in the runtime environment', () => {
    expect(() =>
      parseServerEnv({
        ...validEnvironment,
        MIGRATION_DATABASE_URL: 'postgresql://migration:secret@db.example/cali',
      }),
    ).toThrowError(/MIGRATION_DATABASE_URL/)
  })

  it('reports invalid field names without exposing secret values', () => {
    expect(() =>
      parseServerEnv({
        ...validEnvironment,
        AMA_ENCRYPTION_KEY: 'another-production-secret',
      }),
    ).toThrowError(/AMA_ENCRYPTION_KEY/)

    try {
      parseServerEnv({
        ...validEnvironment,
        AMA_ENCRYPTION_KEY: 'do-not-print-me',
      })
    } catch (error) {
      expect(String(error)).not.toContain('do-not-print-me')
    }
  })

  it('requires Google OAuth credentials without exposing their values', () => {
    const { GOOGLE_CLIENT_SECRET: _missing, ...missingSecret } = validEnvironment
    expect(() =>
      parseServerEnv({
        ...missingSecret,
        AMA_GOOGLE_INTEGRATION_ENABLED: 'true',
      }),
    ).toThrowError(/GOOGLE_CLIENT_SECRET/)

    try {
      parseServerEnv({
        ...validEnvironment,
        GOOGLE_CLIENT_SECRET: '',
        AMA_GOOGLE_INTEGRATION_ENABLED: 'true',
      })
    } catch (error) {
      expect(String(error)).not.toContain('google-client-secret')
    }
  })

  it('requires Stripe credentials only while payments are enabled', () => {
    expect(parseServerEnv(validEnvironment).STRIPE_SECRET_KEY).toBeUndefined()

    expect(() =>
      parseServerEnv({ ...validEnvironment, AMA_PAYMENTS_ENABLED: 'true' }),
    ).toThrowError(/STRIPE_SECRET_KEY.*STRIPE_WEBHOOK_SECRET|STRIPE_WEBHOOK_SECRET.*STRIPE_SECRET_KEY/)

    const environment = parseServerEnv({
      ...validEnvironment,
      AMA_PAYMENTS_ENABLED: 'true',
      STRIPE_SECRET_KEY: 'sk_test_secret',
      STRIPE_WEBHOOK_SECRET: 'whsec_secret',
    })
    expect(environment.features.payments).toBe(true)

    try {
      parseServerEnv({ ...validEnvironment, AMA_PAYMENTS_ENABLED: 'true' })
    } catch (error) {
      expect(String(error)).not.toContain('sk_test')
    }
  })

  it('requires Resend delivery configuration only while finalization is enabled', () => {
    expect(() =>
      parseServerEnv({
        ...validEnvironment,
        AMA_BOOKING_FINALIZATION_ENABLED: 'true',
      }),
    ).toThrowError(/RESEND_API_KEY/)

    const environment = parseServerEnv({
      ...validEnvironment,
      AMA_BOOKING_FINALIZATION_ENABLED: 'true',
      RESEND_API_KEY: 're_secret',
      AMA_EMAIL_FROM: 'Cali Castle <ama@cali.so>',
    })
    expect(environment.features.bookingFinalization).toBe(true)
    expect(environment.AMA_EMAIL_FROM).toBe('Cali Castle <ama@cali.so>')
  })

  it('requires the Tencent MCP bridge only while Tencent is enabled', () => {
    expect(() =>
      parseServerEnv({
        ...validEnvironment,
        AMA_TENCENT_INTEGRATION_ENABLED: 'true',
      }),
    ).toThrowError(/TENCENT_MEETING_MCP_URL/)

    expect(() =>
      parseServerEnv({
        ...validEnvironment,
        AMA_TENCENT_INTEGRATION_ENABLED: 'true',
        TENCENT_MEETING_MCP_URL: 'http://insecure.example.com/mcp',
        TENCENT_MEETING_MCP_TOKEN: 'tencent-token',
      }),
    ).toThrowError(/TENCENT_MEETING_MCP_URL/)

    const environment = parseServerEnv({
      ...validEnvironment,
      AMA_TENCENT_INTEGRATION_ENABLED: 'true',
      TENCENT_MEETING_MCP_URL: 'https://mcp.example.com/tencent',
      TENCENT_MEETING_MCP_TOKEN: 'tencent-token',
    })
    expect(environment.features.tencent).toBe(true)
  })

  it('treats blank provider placeholders like absent configuration', () => {
    const environment = parseServerEnv({
      ...validEnvironment,
      STRIPE_SECRET_KEY: '',
      STRIPE_WEBHOOK_SECRET: '  ',
      RESEND_API_KEY: '',
      AMA_EMAIL_FROM: '',
      TENCENT_MEETING_MCP_URL: '',
      TENCENT_MEETING_MCP_TOKEN: '',
    })
    expect(environment.STRIPE_SECRET_KEY).toBeUndefined()
    expect(environment.RESEND_API_KEY).toBeUndefined()
    expect(environment.TENCENT_MEETING_MCP_URL).toBeUndefined()
  })

  it('reads public booking rate limits with safe defaults', () => {
    const environment = parseServerEnv(validEnvironment)
    expect(environment.AMA_PUBLIC_RATE_LIMIT_MAX_REQUESTS).toBe(10)
    expect(environment.AMA_PUBLIC_RATE_LIMIT_WINDOW_SECONDS).toBe(60)

    expect(() =>
      parseServerEnv({
        ...validEnvironment,
        AMA_PUBLIC_RATE_LIMIT_MAX_REQUESTS: '0',
      }),
    ).toThrowError(/AMA_PUBLIC_RATE_LIMIT_MAX_REQUESTS/)
  })
})
