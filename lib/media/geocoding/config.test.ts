import { describe, expect, it } from 'vitest'

import { parseMediaGeocodingEnv } from './config'

describe('Media Geocoding environment', () => {
  it('uses the provider whenever its credential is configured', () => {
    expect(parseMediaGeocodingEnv({})).toEqual({ apiKey: undefined })
    expect(
      parseMediaGeocodingEnv({
        GOOGLE_MAPS_GEOCODING_API_KEY: 'server-key',
      }),
    ).toEqual({ apiKey: 'server-key' })
  })
})
