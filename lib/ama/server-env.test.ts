import { describe, expect, it } from 'vitest'

import { parseServerEnv } from './server-env-schema'

const validEnvironment = {
  DATABASE_URL: 'postgresql://user:password@example.neon.tech/site',
  RESEND_API_KEY: 're_test_key',
  RESEND_FROM_EMAIL: 'Cali <hello@cali.so>',
  ADMIN_EMAIL: 'owner@example.com',
  SESSION_SECRET: 's'.repeat(64),
  AMA_ENCRYPTION_KEY: Buffer.alloc(32).toString('base64'),
  UPSTASH_REDIS_REST_URL: 'https://example.upstash.io',
  UPSTASH_REDIS_REST_TOKEN: 'redis-secret',
  SITE_URL: 'https://cali.so',
}

describe('AMA server environment', () => {
  it('accepts the complete server-only configuration', () => {
    const environment = parseServerEnv(validEnvironment)

    expect(environment.ADMIN_EMAIL).toBe('owner@example.com')
    expect(environment.AUTH_RATE_LIMIT_MAX_REQUESTS).toBe(5)
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
})
