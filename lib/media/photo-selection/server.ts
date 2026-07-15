import 'server-only'

import { unstable_cache } from 'next/cache'

import { getDatabase } from '~/db'

import {
  createPublicPhotoSelectionRepository,
  PUBLIC_PHOTO_SELECTION_CACHE_TAG,
  type PublicPhotoSelection,
} from './repository'
import { parseBunnyRenditionCdnEnv } from '../storage/config'

type CachedPublicPhoto = Omit<
  PublicPhotoSelection['items'][number],
  'capturedAt'
> & {
  capturedAt?: Date | string
}

type CachedPublicPhotoSelection = Omit<
  PublicPhotoSelection,
  'publishedAt' | 'items'
> & {
  publishedAt: Date | string
  items: CachedPublicPhoto[]
}

function restoreSelectionDates(
  selection: CachedPublicPhotoSelection | null,
): PublicPhotoSelection | null {
  if (!selection) return null
  return {
    ...selection,
    publishedAt:
      selection.publishedAt instanceof Date
        ? selection.publishedAt
        : new Date(selection.publishedAt),
    items: selection.items.map(({ capturedAt, ...item }) => ({
      ...item,
      ...(capturedAt
        ? {
            capturedAt:
              capturedAt instanceof Date ? capturedAt : new Date(capturedAt),
          }
        : {}),
    })),
  }
}

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

export async function getPublishedPhotoSelection() {
  try {
    return restoreSelectionDates(
      (await readPublishedPhotoSelection()) as CachedPublicPhotoSelection | null,
    )
  } catch {
    return null
  }
}
