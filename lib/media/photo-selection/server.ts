import 'server-only'

import { unstable_cache } from 'next/cache'

import { getDatabase } from '~/db'

import {
  createPublicPhotoSelectionRepository,
  PUBLIC_PHOTO_SELECTION_CACHE_TAG,
  type PublicPhotoSelection,
} from './repository'
import { devPhotoSelectionFixture } from './dev-fixtures'
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

// Local development only: when no real selection exists (no database or
// nothing published), fall back to generated test cards so the photos
// surfaces render. Strictly gated — test and production behavior unchanged.
function devFallback(): PublicPhotoSelection | null {
  return process.env.NODE_ENV === 'development' ? devPhotoSelectionFixture() : null
}

export async function getPublishedPhotoSelection() {
  try {
    const selection = restoreSelectionDates(
      (await readPublishedPhotoSelection()) as CachedPublicPhotoSelection | null,
    )
    if (selection && selection.items.length > 0) return selection
    return devFallback()
  } catch {
    return devFallback()
  }
}
