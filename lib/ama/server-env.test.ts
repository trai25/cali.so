import { describe, expect, it } from 'vitest'

import { parseServerEnv } from './server-env-schema'

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
  it('accepts the complete server-only configuration', () => {
    const environment = parseServerEnv(validEnvironment)

    expect(environment.ADMIN_EMAIL).toBe('owner@example.com')
    expect(environment.AUTH_RATE_LIMIT_MAX_REQUESTS).toBe(5)
    expect(environment.ADMIN_MUTATION_RATE_LIMIT_MAX_REQUESTS).toBe(30)
    expect(environment.features).toEqual({
      publicMutations: false,
      payments: false,
      bookingFinalization: false,
      admin: false,
      google: false,
      tencent: false,
    })
  })

  it('enables each sensitive feature only through an explicit switch', () => {
    const environment = parseServerEnv({
      ...validEnvironment,
      AMA_PUBLIC_MUTATIONS_ENABLED: 'true',
      AMA_PAYMENTS_ENABLED: 'true',
      AMA_BOOKING_FINALIZATION_ENABLED: 'true',
      AMA_ADMIN_ENABLED: 'true',
      AMA_GOOGLE_INTEGRATION_ENABLED: 'true',
      AMA_TENCENT_INTEGRATION_ENABLED: 'true',
    })

    expect(environment.features).toEqual({
      publicMutations: true,
      payments: true,
      bookingFinalization: true,
      admin: true,
      google: true,
      tencent: true,
    })
  })

  it('rejects ambiguous feature-switch values', () => {
    expect(() =>
      parseServerEnv({ ...validEnvironment, AMA_ADMIN_ENABLED: 'yes' }),
    ).toThrowError(/AMA_ADMIN_ENABLED/)
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
    expect(() => parseServerEnv(missingSecret)).toThrowError(/GOOGLE_CLIENT_SECRET/)

    try {
      parseServerEnv({ ...validEnvironment, GOOGLE_CLIENT_SECRET: '' })
    } catch (error) {
      expect(String(error)).not.toContain('google-client-secret')
    }
  })
})
