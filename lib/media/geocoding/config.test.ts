import { describe, expect, it } from 'vitest'

import { parseMediaGeocodingEnv } from './config'

describe('Media Geocoding environment', () => {
  it('fails closed until explicitly enabled with a credential', () => {
    expect(parseMediaGeocodingEnv({})).toEqual({
      enabled: false,
      apiKey: undefined,
    })
    expect(() =>
      parseMediaGeocodingEnv({ MEDIA_GEOCODING_ENABLED: 'true' }),
    ).toThrow('GOOGLE_MAPS_GEOCODING_API_KEY')
    expect(
      parseMediaGeocodingEnv({
        MEDIA_GEOCODING_ENABLED: 'true',
        GOOGLE_MAPS_GEOCODING_API_KEY: 'server-key',
      }),
    ).toEqual({ enabled: true, apiKey: 'server-key' })
  })
})
