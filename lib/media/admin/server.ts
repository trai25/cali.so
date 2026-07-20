import 'server-only'

import { revalidateTag } from 'next/cache'

import { getDatabase } from '~/db'
import {
  getOwnerAdminSecurity,
  ownerRequestAuthenticator,
} from '~/lib/admin/server'
import { getServerEnv } from '~/lib/ama/server-env'
import { createRateLimiter } from '~/lib/rate-limit/server'

import { parseMediaAltTextEnv } from '../alt-text/config'
import { createMediaAltTextGenerator } from '../alt-text/gateway'
import { createMediaAltTextRepository } from '../alt-text/repository'
import { createMediaAltTextService } from '../alt-text/service'
import { createMediaAssetReviewRepository } from '../asset-review/repository'
import { createMediaAssetReviewService } from '../asset-review/service'
import { parseMediaGeocodingEnv } from '../geocoding/config'
import { createGoogleMapsLocationLabelSuggester } from '../geocoding/provider'
import { createMediaGeocodingRepository } from '../geocoding/repository'
import { createMediaGeocodingService } from '../geocoding/service'
import { createMediaIngestionRepository } from '../ingestion/repository'
import { createMediaIngestionService } from '../ingestion/service'
import { createCaptureLocationVault } from '../privacy/capture-location'
import {
  createPhotoSelectionRepository,
  PUBLIC_PHOTO_SELECTION_CACHE_TAG,
} from '../photo-selection/repository'
import { createPhotoSelectionService } from '../photo-selection/service'
import { createMediaPurgeRepository } from '../purge/repository'
import { createMediaPurgeService } from '../purge/service'
import { createMediaReconciliationRepository } from '../reconciliation/repository'
import { createMediaReconciliationService } from '../reconciliation/service'
import { createPublicRenditionUrl } from '../storage/bunny'
import { parseBunnyMediaCdnEnv } from '../storage/config'
import { getMediaStorage } from '../storage/server'
import { createMediaTransferRepository } from '../transfer/repository'
import { createMediaTransferService } from '../transfer/service'

let services: ReturnType<typeof createServices> | undefined
let pageServices: ReturnType<typeof createPageServices> | undefined

function createCatalogServices(publicRenditionUrl: (key: string) => string) {
  const database = () => getDatabase()
  const invalidatePublicSelection = async () => {
    revalidateTag(PUBLIC_PHOTO_SELECTION_CACHE_TAG, { expire: 0 })
  }
  const review = createMediaAssetReviewService({
    repository: createMediaAssetReviewRepository(database, publicRenditionUrl),
    invalidatePublicSelection,
  })
  const selection = createPhotoSelectionService({
    repository: createPhotoSelectionRepository(database),
    // Next 16.3 requires a cache-life profile or expire object here;
    // updateTag is restricted to Server Actions and this runs in a Route Handler.
    invalidatePublicSelection,
  })

  return { database, invalidatePublicSelection, review, selection }
}

function createPageServices() {
  const cdnBaseUrl = parseBunnyMediaCdnEnv(process.env)
  const { database, review, selection } = createCatalogServices(
    createPublicRenditionUrl(cdnBaseUrl),
  )
  const transferRepository = createMediaTransferRepository(database)
  return {
    getDraft: selection.getDraft,
    listAssets: review.listAssets,
    listTransfers: transferRepository.listOwnedTransferJobs,
  }
}

function createServices() {
  const environment = getServerEnv()
  const storage = getMediaStorage()
  const uploadChunkRateLimitWindowSeconds = 60
  const uploadChunkRateLimiter = createRateLimiter(
    environment.rateLimitBackend,
    {
      prefix: 'cali:media:upload-chunk',
      maxRequests: 40,
      windowSeconds: uploadChunkRateLimitWindowSeconds,
    },
  )
  const { database, invalidatePublicSelection, review, selection } =
    createCatalogServices(storage.publicRenditionUrl)
  const ingestionRepository = createMediaIngestionRepository(database)
  const mediaEncryptionKey = process.env.MEDIA_ENCRYPTION_KEY
  if (!mediaEncryptionKey) {
    throw new Error('Invalid Media environment: MEDIA_ENCRYPTION_KEY')
  }
  const captureLocationVault = createCaptureLocationVault(mediaEncryptionKey)
  const ingestion = createMediaIngestionService({
    repository: ingestionRepository,
    storage,
    captureLocationVault,
  })
  const purge = createMediaPurgeService({
    repository: createMediaPurgeRepository(database),
    storage,
    invalidatePublicSelection,
  })
  const transfer = createMediaTransferService({
    repository: createMediaTransferRepository(database),
    purge,
    storage,
  })
  const altTextConfig = parseMediaAltTextEnv(process.env)
  const altText = createMediaAltTextService({
    repository: createMediaAltTextRepository(database),
    storage,
    generator: createMediaAltTextGenerator(altTextConfig),
    rateLimiter: createRateLimiter(environment.rateLimitBackend, {
      prefix: 'cali:media:alt-text',
      maxRequests: altTextConfig.rateLimitMaxRequests,
      windowSeconds: altTextConfig.rateLimitWindowSeconds,
    }),
  })

  const geocodingConfig = parseMediaGeocodingEnv(process.env)
  const geocoding = geocodingConfig.apiKey
    ? createMediaGeocodingService({
        repository: createMediaGeocodingRepository(database),
        captureLocationVault,
        suggester: createGoogleMapsLocationLabelSuggester({
          apiKey: geocodingConfig.apiKey,
        }),
      })
    : null
  const reconciliation = createMediaReconciliationService({
    repository: createMediaReconciliationRepository(database),
    ingestion,
    storage,
    altText,
  })

  return {
    altText,
    baseUrl: environment.SITE_URL,
    geocoding,
    ingestion,
    ingestionRepository,
    purge,
    reconciliation,
    review,
    selection,
    security: getOwnerAdminSecurity(),
    storage,
    transfer,
    uploadChunkRateLimiter: {
      retryAfterSeconds: uploadChunkRateLimitWindowSeconds,
      limit: (key: string) => uploadChunkRateLimiter.limit(key),
    },
  }
}

export function getMediaAdminServices() {
  services ??= createServices()
  return services
}

export function getMediaAdminPageServices() {
  pageServices ??= createPageServices()
  return pageServices
}

export { ownerRequestAuthenticator }
