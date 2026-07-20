import { z } from 'zod'

import {
  BUNNY_STORAGE_REGIONS,
  type BunnyStorageConfig,
} from './bunny'

const nonEmptySecret = z.string().trim().min(1)
const zoneName = z.string().trim().min(1).max(64).regex(/^[a-zA-Z0-9-]+$/)

const cdnBaseUrl = z.url().transform((value, context) => {
  const url = new URL(value)
  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.hostname === 'storage.bunnycdn.com' ||
    url.hostname.endsWith('.storage.bunnycdn.com') ||
    (url.pathname !== '/' && url.pathname !== '')
  ) {
    context.addIssue({
      code: 'custom',
      message: 'Rendition CDN URL must be an HTTPS origin',
    })
    return z.NEVER
  }
  url.pathname = '/'
  return url
})

const bunnyStorageEnvironmentSchema = z
  .object({
    BUNNY_MEDIA_REGION: z.enum(BUNNY_STORAGE_REGIONS),
    BUNNY_MEDIA_ZONE: zoneName,
    BUNNY_MEDIA_PASSWORD: nonEmptySecret,
    BUNNY_MEDIA_CDN_URL: cdnBaseUrl,
    BUNNY_CDN_API_KEY: nonEmptySecret,
  })
  .transform(
    (environment): BunnyStorageConfig => ({
      region: environment.BUNNY_MEDIA_REGION,
      media: {
        zone: environment.BUNNY_MEDIA_ZONE,
        password: environment.BUNNY_MEDIA_PASSWORD,
        cdnBaseUrl: environment.BUNNY_MEDIA_CDN_URL,
      },
      cdnApiKey: environment.BUNNY_CDN_API_KEY,
    }),
  )

export function parseBunnyStorageEnv(source: Record<string, string | undefined>) {
  const result = bunnyStorageEnvironmentSchema.safeParse(source)
  if (result.success) return result.data

  const fields = [
    ...new Set(result.error.issues.map((issue) => issue.path.join('.')).filter(Boolean)),
  ]
  throw new Error(`Invalid Bunny Media Storage environment: ${fields.join(', ')}`)
}

export function parseBunnyMediaCdnEnv(
  source: Record<string, string | undefined>,
) {
  const result = cdnBaseUrl.safeParse(source.BUNNY_MEDIA_CDN_URL)
  if (result.success) return result.data
  throw new Error(
    'Invalid Bunny Media Storage environment: BUNNY_MEDIA_CDN_URL',
  )
}
