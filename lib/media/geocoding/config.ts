import { z } from 'zod'

const featureSwitch = z
  .enum(['true', 'false'])
  .default('false')
  .transform((value) => value === 'true')

const schema = z
  .object({
    MEDIA_GEOCODING_ENABLED: featureSwitch,
    GOOGLE_MAPS_GEOCODING_API_KEY: z.string().trim().min(1).optional(),
  })
  .superRefine((environment, context) => {
    if (
      environment.MEDIA_GEOCODING_ENABLED &&
      !environment.GOOGLE_MAPS_GEOCODING_API_KEY
    ) {
      context.addIssue({
        code: 'custom',
        path: ['GOOGLE_MAPS_GEOCODING_API_KEY'],
        message: 'Google Maps Geocoding requires a server credential',
      })
    }
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
    enabled: result.data.MEDIA_GEOCODING_ENABLED,
    apiKey: result.data.GOOGLE_MAPS_GEOCODING_API_KEY,
  }
}
