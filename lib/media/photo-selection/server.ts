import 'server-only'

import { unstable_cache } from 'next/cache'

import { getDatabase } from '~/db'

import {
  createPublicPhotoSelectionRepository,
  PUBLIC_PHOTO_SELECTION_CACHE_TAG,
} from './repository'
import { parseBunnyRenditionCdnEnv } from '../storage/config'

const readPublishedPhotoSelection = unstable_cache(
  async () => {
    const cdnBaseUrl = parseBunnyRenditionCdnEnv(process.env)
    return createPublicPhotoSelectionRepository(
      () => getDatabase(),
      cdnBaseUrl,
    ).getPublishedSelection()
  },
  ['published-photo-selection'],
  {
    tags: [PUBLIC_PHOTO_SELECTION_CACHE_TAG],
    revalidate: false,
  },
)

export function getPublishedPhotoSelection() {
  return readPublishedPhotoSelection()
}
