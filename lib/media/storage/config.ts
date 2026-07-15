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
    BUNNY_ORIGINALS_ZONE: zoneName,
    BUNNY_ORIGINALS_PASSWORD: nonEmptySecret,
    BUNNY_RENDITIONS_ZONE: zoneName,
    BUNNY_RENDITIONS_PASSWORD: nonEmptySecret,
    BUNNY_RENDITIONS_CDN_URL: cdnBaseUrl,
    BUNNY_CDN_API_KEY: nonEmptySecret,
  })
  .superRefine((environment, context) => {
    if (environment.BUNNY_ORIGINALS_ZONE === environment.BUNNY_RENDITIONS_ZONE) {
      context.addIssue({
        code: 'custom',
        path: ['BUNNY_RENDITIONS_ZONE'],
        message: 'Originals and Renditions require distinct zones',
      })
    }
  })
  .transform(
    (environment): BunnyStorageConfig => ({
      region: environment.BUNNY_MEDIA_REGION,
      originals: {
        zone: environment.BUNNY_ORIGINALS_ZONE,
        password: environment.BUNNY_ORIGINALS_PASSWORD,
      },
      renditions: {
        zone: environment.BUNNY_RENDITIONS_ZONE,
        password: environment.BUNNY_RENDITIONS_PASSWORD,
        cdnBaseUrl: environment.BUNNY_RENDITIONS_CDN_URL,
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
