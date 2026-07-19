import { afterEach, describe, expect, it, vi } from 'vitest'

describe('public site origin', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.resetModules()
  })

  it('keeps Staging discovery canonical to the public site', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('SITE_URL', 'https://beta.cali.so')

    const { seo } = await import('./seo')

    expect(seo.url.href).toBe('https://cali.so/')
  })

  it('accepts an explicit public site origin independently of the runtime origin', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('PUBLIC_SITE_URL', 'https://example.com')
    vi.stubEnv('SITE_URL', 'https://staging.example.com')

    const { seo } = await import('./seo')

    expect(seo.url.href).toBe('https://example.com/')
  })

  it('rejects an insecure non-local public site origin', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('PUBLIC_SITE_URL', 'http://example.com')

    await expect(import('./seo')).rejects.toThrowError(/PUBLIC_SITE_URL/)
  })
})
