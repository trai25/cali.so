import 'server-only'

import { Ratelimit } from '@upstash/ratelimit'
import { Redis } from '@upstash/redis'

import { getDatabase } from '~/db'
import {
  getOwnerAdminSecurity,
  ownerRequestAuthenticator,
} from '~/lib/admin/server'
import { getServerEnv } from '~/lib/ama/server-env'

import { parseMediaAltTextEnv } from '../alt-text/config'
import { createMediaAltTextGenerator } from '../alt-text/gateway'
import { createMediaAltTextRepository } from '../alt-text/repository'
import { createMediaAltTextService } from '../alt-text/service'
import { createMediaAssetReviewRepository } from '../asset-review/repository'
import { createMediaAssetReviewService } from '../asset-review/service'
import { createMediaIngestionRepository } from '../ingestion/repository'
import { createMediaIngestionService } from '../ingestion/service'
import { createCaptureLocationVault } from '../privacy/capture-location'
import { createMediaPurgeRepository } from '../purge/repository'
import { createMediaPurgeService } from '../purge/service'
import { getMediaStorage } from '../storage/server'

let services: ReturnType<typeof createServices> | undefined

function createServices() {
  const environment = getServerEnv()
  const storage = getMediaStorage()
  const database = () => getDatabase()
  const review = createMediaAssetReviewService({
    repository: createMediaAssetReviewRepository(
      database,
      storage.publicRenditionUrl,
    ),
  })
  const ingestionRepository = createMediaIngestionRepository(database)
  const mediaEncryptionKey = process.env.MEDIA_ENCRYPTION_KEY
  if (!mediaEncryptionKey) {
    throw new Error('Invalid Media environment: MEDIA_ENCRYPTION_KEY')
  }
  const ingestion = createMediaIngestionService({
    repository: ingestionRepository,
    storage,
    captureLocationVault: createCaptureLocationVault(mediaEncryptionKey),
  })
  const purge = createMediaPurgeService({
    repository: createMediaPurgeRepository(database),
    storage,
  })

  const altTextConfig = parseMediaAltTextEnv(process.env)
  const redis = new Redis({
    url: environment.UPSTASH_REDIS_REST_URL,
    token: environment.UPSTASH_REDIS_REST_TOKEN,
  })
  const altTextLimiter = new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(
      altTextConfig.rateLimitMaxRequests,
      `${altTextConfig.rateLimitWindowSeconds} s`,
    ),
    prefix: 'cali:media:alt-text',
  })
  const altText = altTextConfig.enabled
    ? createMediaAltTextService({
        repository: createMediaAltTextRepository(database),
        storage,
        generator: createMediaAltTextGenerator(altTextConfig),
        rateLimiter: altTextLimiter,
      })
    : null

  return {
    altText,
    baseUrl: environment.SITE_URL,
    ingestion,
    ingestionRepository,
    purge,
    review,
    security: getOwnerAdminSecurity(),
    storage,
  }
}

export function getMediaAdminServices() {
  services ??= createServices()
  return services
}

export { ownerRequestAuthenticator }
