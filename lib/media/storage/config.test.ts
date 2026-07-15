import { describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

import { parseBunnyStorageEnv } from './config'

const validEnvironment = {
  BUNNY_MEDIA_REGION: 'sg',
  BUNNY_ORIGINALS_ZONE: 'cali-media-originals-preview',
  BUNNY_ORIGINALS_PASSWORD: 'originals-zone-password',
  BUNNY_RENDITIONS_ZONE: 'cali-media-renditions-preview',
  BUNNY_RENDITIONS_PASSWORD: 'renditions-zone-password',
  BUNNY_RENDITIONS_CDN_URL: 'https://media-preview.cali.so',
  BUNNY_CDN_API_KEY: 'preview-cdn-api-key',
}

describe('Bunny Media Storage configuration', () => {
  it('accepts distinct private and public zones in a supported region', () => {
    expect(parseBunnyStorageEnv(validEnvironment)).toEqual({
      region: 'sg',
      originals: {
        zone: 'cali-media-originals-preview',
        password: 'originals-zone-password',
      },
      renditions: {
        zone: 'cali-media-renditions-preview',
        password: 'renditions-zone-password',
        cdnBaseUrl: new URL('https://media-preview.cali.so/'),
      },
      cdnApiKey: 'preview-cdn-api-key',
    })
  })

  it('rejects a storage endpoint as the public CDN origin without exposing secrets', () => {
    const unsafe = {
      ...validEnvironment,
      BUNNY_ORIGINALS_PASSWORD: 'do-not-print-originals-secret',
      BUNNY_RENDITIONS_PASSWORD: 'do-not-print-renditions-secret',
      BUNNY_CDN_API_KEY: 'do-not-print-cdn-secret',
      BUNNY_RENDITIONS_CDN_URL: 'https://sg-s3.storage.bunnycdn.com',
    }

    let message = ''
    try {
      parseBunnyStorageEnv(unsafe)
    } catch (error) {
      message = String(error)
    }

    expect(message).toContain('BUNNY_RENDITIONS_CDN_URL')
    expect(message).not.toContain('do-not-print')
    expect(message).not.toContain('storage.bunnycdn.com')
  })
})
