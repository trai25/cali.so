import { describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

import { createGoogleMapsLocationLabelSuggester } from './provider'

describe('Google Maps Location Label provider', () => {
  it('requests bilingual labels without returning the raw response', async () => {
    const requests: URL[] = []
    const fetcher = vi.fn(async (input: URL | RequestInfo) => {
      const url = new URL(String(input))
      requests.push(url)
      const label =
        url.searchParams.get('language') === 'zh-CN'
          ? '美国加利福尼亚州旧金山'
          : 'San Francisco, CA, USA'
      return Response.json({
        status: 'OK',
        results: [{ formatted_address: label, geometry: { private: true } }],
      })
    }) as typeof fetch
    const suggester = createGoogleMapsLocationLabelSuggester({
      apiKey: 'server-key',
      fetcher,
    })

    await expect(
      suggester.suggest({ latitude: 37.7749, longitude: -122.4194 }),
    ).resolves.toEqual({
      zhHans: '美国加利福尼亚州旧金山',
      en: 'San Francisco, CA, USA',
    })
    expect(requests).toHaveLength(2)
    expect(requests.every((url) => url.origin === 'https://maps.googleapis.com')).toBe(
      true,
    )
    expect(
      requests.every(
        (url) =>
          url.searchParams.get('latlng') === '37.7749,-122.4194' &&
          url.searchParams.get('key') === 'server-key',
      ),
    ).toBe(true)
  })

  it('omits an unavailable locale and rejects malformed provider output', async () => {
    const partial = createGoogleMapsLocationLabelSuggester({
      apiKey: 'server-key',
      fetcher: vi.fn(async (input: URL | RequestInfo) => {
        const language = new URL(String(input)).searchParams.get('language')
        return Response.json(
          language === 'zh-CN'
            ? { status: 'ZERO_RESULTS', results: [] }
            : { status: 'OK', results: [{ formatted_address: 'Taipei' }] },
        )
      }) as typeof fetch,
    })
    await expect(
      partial.suggest({ latitude: 25.033, longitude: 121.5654 }),
    ).resolves.toEqual({ en: 'Taipei' })

    const malformed = createGoogleMapsLocationLabelSuggester({
      apiKey: 'server-key',
      fetcher: vi.fn(async () => Response.json({ status: 'OK', results: [{}] })) as typeof fetch,
    })
    await expect(
      malformed.suggest({ latitude: 25.033, longitude: 121.5654 }),
    ).rejects.toThrow('Location Label provider unavailable')
  })
})
