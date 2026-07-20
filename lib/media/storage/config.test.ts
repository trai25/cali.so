import { describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

import { parseBunnyMediaCdnEnv, parseBunnyStorageEnv } from './config'

const validEnvironment = {
  BUNNY_MEDIA_REGION: 'sg',
  BUNNY_MEDIA_ZONE: 'cali-media-preview',
  BUNNY_MEDIA_PASSWORD: 'media-zone-password',
  BUNNY_MEDIA_CDN_URL: 'https://media-preview.cali.so',
  BUNNY_CDN_API_KEY: 'preview-cdn-api-key',
}

describe('Bunny Media Storage configuration', () => {
  it('accepts one public Media zone in a supported region', () => {
    expect(parseBunnyStorageEnv(validEnvironment)).toEqual({
      region: 'sg',
      media: {
        zone: 'cali-media-preview',
        password: 'media-zone-password',
        cdnBaseUrl: new URL('https://media-preview.cali.so/'),
      },
      cdnApiKey: 'preview-cdn-api-key',
    })
  })

  it('rejects a storage endpoint as the public CDN origin without exposing secrets', () => {
    const unsafe = {
      ...validEnvironment,
      BUNNY_MEDIA_PASSWORD: 'do-not-print-media-secret',
      BUNNY_CDN_API_KEY: 'do-not-print-cdn-secret',
      BUNNY_MEDIA_CDN_URL: 'https://sg-s3.storage.bunnycdn.com',
    }

    let message = ''
    try {
      parseBunnyStorageEnv(unsafe)
    } catch (error) {
      message = String(error)
    }

    expect(message).toContain('BUNNY_MEDIA_CDN_URL')
    expect(message).not.toContain('do-not-print')
    expect(message).not.toContain('storage.bunnycdn.com')
  })

  it('loads the public Media origin without requiring storage credentials', () => {
    expect(
      parseBunnyMediaCdnEnv({
        BUNNY_MEDIA_CDN_URL: 'https://media-preview.cali.so',
      }),
    ).toEqual(new URL('https://media-preview.cali.so/'))
  })
})
