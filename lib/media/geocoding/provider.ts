import 'server-only'

import { z } from 'zod'

import type { CaptureLocation } from '../privacy/capture-location'

export type LocationLabelSuggestion = {
  zhHans?: string
  en?: string
}

const providerResponse = z.object({
  status: z.string(),
  results: z
    .array(
      z.object({
        formatted_address: z.string().trim().min(1).max(280),
      }),
    )
    .optional(),
})

async function labelForLanguage({
  apiKey,
  fetcher,
  language,
  location,
  timeoutMs,
}: {
  apiKey: string
  fetcher: typeof fetch
  language: 'en' | 'zh-CN'
  location: CaptureLocation
  timeoutMs: number
}) {
  const url = new URL('https://maps.googleapis.com/maps/api/geocode/json')
  url.searchParams.set('latlng', `${location.latitude},${location.longitude}`)
  url.searchParams.set('language', language)
  url.searchParams.set('key', apiKey)
  const response = await fetcher(url, {
    cache: 'no-store',
    signal: AbortSignal.timeout(timeoutMs),
  })
  if (!response.ok) throw new Error('Location Label provider unavailable')
  const parsed = providerResponse.safeParse(await response.json())
  if (!parsed.success) throw new Error('Location Label provider unavailable')
  if (parsed.data.status === 'ZERO_RESULTS') return null
  if (parsed.data.status !== 'OK') {
    throw new Error('Location Label provider unavailable')
  }
  return parsed.data.results?.[0]?.formatted_address ?? null
}

export function createGoogleMapsLocationLabelSuggester({
  apiKey,
  fetcher = fetch,
  timeoutMs = 5_000,
}: {
  apiKey: string
  fetcher?: typeof fetch
  timeoutMs?: number
}) {
  return {
    async suggest(location: CaptureLocation): Promise<LocationLabelSuggestion> {
      const [zhHansResult, enResult] = await Promise.allSettled([
        labelForLanguage({
          apiKey,
          fetcher,
          language: 'zh-CN',
          location,
          timeoutMs,
        }),
        labelForLanguage({
          apiKey,
          fetcher,
          language: 'en',
          location,
          timeoutMs,
        }),
      ])
      const zhHans =
        zhHansResult.status === 'fulfilled' ? zhHansResult.value : null
      const en = enResult.status === 'fulfilled' ? enResult.value : null
      if (
        !zhHans &&
        !en &&
        (zhHansResult.status === 'rejected' || enResult.status === 'rejected')
      ) {
        throw new Error('Location Label provider unavailable')
      }
      return {
        ...(zhHans ? { zhHans } : {}),
        ...(en ? { en } : {}),
      }
    },
  }
}
