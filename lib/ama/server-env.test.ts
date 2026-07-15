import { describe, expect, it } from 'vitest'

import { parseAmaFeatures, parseServerEnv } from './server-env-schema'

const validEnvironment = {
  DATABASE_URL: 'postgresql://user:password@example.neon.tech/site',
  RESEND_API_KEY: 're_test_key',
  RESEND_FROM_EMAIL: 'Cali <hello@cali.so>',
  ADMIN_EMAIL: 'owner@example.com',
  SESSION_SECRET: 's'.repeat(64),
  AMA_ENCRYPTION_KEY: Buffer.alloc(32).toString('base64'),
  RATE_LIMIT_HASH_KEY: Buffer.alloc(32, 2).toString('base64'),
  GOOGLE_CLIENT_ID: 'google-client-id.apps.googleusercontent.com',
  GOOGLE_CLIENT_SECRET: 'google-client-secret',
  UPSTASH_REDIS_REST_URL: 'https://example.upstash.io',
  UPSTASH_REDIS_REST_TOKEN: 'redis-secret',
  SITE_URL: 'https://cali.so',
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
    expect(environment.AUTH_RATE_LIMIT_MAX_REQUESTS).toBe(5)
    expect(environment.ADMIN_MUTATION_RATE_LIMIT_MAX_REQUESTS).toBe(30)
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

    expect(environment.UPSTASH_REDIS_REST_URL).toBe(
      'https://marketplace.upstash.io',
    )
    expect(environment.UPSTASH_REDIS_REST_TOKEN).toBe('marketplace-secret')
    expect(environment).not.toHaveProperty('KV_REST_API_URL')
    expect(environment).not.toHaveProperty('KV_REST_API_TOKEN')
  })

  it('prefers native Upstash credentials when both pairs are complete', () => {
    const environment = parseServerEnv({
      ...validEnvironment,
      KV_REST_API_URL: 'https://marketplace.upstash.io',
      KV_REST_API_TOKEN: 'marketplace-secret',
    })

    expect(environment.UPSTASH_REDIS_REST_URL).toBe(
      validEnvironment.UPSTASH_REDIS_REST_URL,
    )
    expect(environment.UPSTASH_REDIS_REST_TOKEN).toBe(
      validEnvironment.UPSTASH_REDIS_REST_TOKEN,
    )
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
        SESSION_SECRET: 'short-secret',
        AMA_ENCRYPTION_KEY: 'another-production-secret',
      }),
    ).toThrowError(/SESSION_SECRET, AMA_ENCRYPTION_KEY/)

    try {
      parseServerEnv({ ...validEnvironment, SESSION_SECRET: 'do-not-print-me' })
    } catch (error) {
      expect(String(error)).not.toContain('do-not-print-me')
    }
  })

  it('rejects a malformed Resend sender mailbox', () => {
    expect(() =>
      parseServerEnv({ ...validEnvironment, RESEND_FROM_EMAIL: 'Cali <@@@>' }),
    ).toThrowError(/RESEND_FROM_EMAIL/)
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
})
