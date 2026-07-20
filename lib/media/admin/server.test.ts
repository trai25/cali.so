import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

import { getMediaAdminPageServices } from './server'

const mediaEnvironmentNames = [
  'BUNNY_MEDIA_REGION',
  'BUNNY_MEDIA_ZONE',
  'BUNNY_MEDIA_PASSWORD',
  'BUNNY_MEDIA_CDN_URL',
  'BUNNY_CDN_API_KEY',
  'MEDIA_ENCRYPTION_KEY',
] as const

const previousEnvironment = Object.fromEntries(
  mediaEnvironmentNames.map((name) => [name, process.env[name]]),
)

afterEach(() => {
  for (const name of mediaEnvironmentNames) {
    const value = previousEnvironment[name]
    if (value === undefined) delete process.env[name]
    else process.env[name] = value
  }
})

describe('Media admin page services', () => {
  it('does not initialize write-only secrets while listing assets', () => {
    for (const name of mediaEnvironmentNames) delete process.env[name]
    process.env.BUNNY_MEDIA_CDN_URL = 'https://media.cali.so'

    const services = getMediaAdminPageServices()

    expect(services).toEqual({
      getDraft: expect.any(Function),
      listAssets: expect.any(Function),
    })
    expect(services).not.toHaveProperty('review')
    expect(services).not.toHaveProperty('selection')
  })
})
