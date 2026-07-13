export interface VisitorOrigin {
  country: string
  city?: string
}

const MAX_CITY_LENGTH = 80
const MAX_ENCODED_CITY_LENGTH = MAX_CITY_LENGTH * 12
const CITY_CHARACTERS = /^[\p{L}\p{M}\p{N} .,'’()&-]+$/u
const CONTROL_CHARACTERS = /\p{C}/u

function codePointLength(value: string) {
  return Array.from(value).length
}

export function sanitizeVisitorCity(value: unknown): string | null {
  if (typeof value !== 'string' || value.length === 0 || CONTROL_CHARACTERS.test(value)) {
    return null
  }

  const city = value.normalize('NFKC').trim().replace(/\s+/g, ' ')
  if (
    city.length === 0 ||
    codePointLength(city) > MAX_CITY_LENGTH ||
    !CITY_CHARACTERS.test(city)
  ) {
    return null
  }

  return city
}

export function sanitizeCountryCode(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const country = value.trim().toUpperCase()
  return /^[A-Z]{2}$/.test(country) ? country : null
}

function decodeGeoHeader(value: string, maxEncodedLength: number): string | null {
  if (value.length === 0 || value.length > maxEncodedLength) return null
  try {
    return decodeURIComponent(value)
  } catch {
    return null
  }
}

export function visitorOriginFromHeaders(headers: Headers): VisitorOrigin | null {
  const encodedCountry = headers.get('x-vercel-ip-country')
  if (!encodedCountry) return null

  const decodedCountry = decodeGeoHeader(encodedCountry, 24)
  const country = sanitizeCountryCode(decodedCountry)
  if (!country) return null

  const encodedCity = headers.get('x-vercel-ip-city')
  if (!encodedCity) return { country }

  const decodedCity = decodeGeoHeader(encodedCity, MAX_ENCODED_CITY_LENGTH)
  const city = sanitizeVisitorCity(decodedCity)
  return city ? { city, country } : { country }
}

export function parseVisitorOrigin(value: unknown): VisitorOrigin | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null

  const candidate = value as Record<string, unknown>
  if (Object.keys(candidate).some((key) => key !== 'city' && key !== 'country')) return null
  const country = sanitizeCountryCode(candidate.country)
  if (!country) return null

  if (candidate.city === undefined) return { country }
  const city = sanitizeVisitorCity(candidate.city)
  return city ? { city, country } : null
}
