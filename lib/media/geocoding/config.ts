import { z } from 'zod'

const schema = z.object({
  GOOGLE_MAPS_GEOCODING_API_KEY: z.string().trim().min(1).optional(),
})

export function parseMediaGeocodingEnv(
  source: Record<string, string | undefined>,
) {
  const result = schema.safeParse(source)
  if (!result.success) {
    const fields = [
      ...new Set(
        result.error.issues.map((issue) => issue.path.join('.')).filter(Boolean),
      ),
    ]
    throw new Error(`Invalid Media Geocoding environment: ${fields.join(', ')}`)
  }
  return {
    apiKey: result.data.GOOGLE_MAPS_GEOCODING_API_KEY,
  }
}
