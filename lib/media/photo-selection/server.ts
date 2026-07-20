import 'server-only'

import { cacheLife, cacheTag } from 'next/cache'

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

// Development renders the fixture cards when the read fails, so the full
// error stack on every request is pure noise there — one compact warning
// per process is enough. Everywhere else the error must stay loud.
let warnedDevelopmentReadFailure = false

function logReadFailure(scope: 'read' | 'public read', error: unknown) {
  if (process.env.NODE_ENV === 'development') {
    if (warnedDevelopmentReadFailure) return
    warnedDevelopmentReadFailure = true
    const summary =
      error instanceof Error ? error.message.split('\n')[0] : String(error)
    console.warn(
      `[photo-selection] database unreachable in development; rendering dev fixtures (${summary})`,
    )
    return
  }
  console.error(`[photo-selection] ${scope} failed; rendering empty state`, error)
}

async function readPublishedPhotoSelection() {
  'use cache'
  cacheTag(PUBLIC_PHOTO_SELECTION_CACHE_TAG)
  cacheLife('max')
  try {
    const cdnBaseUrl = parseBunnyRenditionCdnEnv(process.env)
    return await createPublicPhotoSelectionRepository(
      () => getDatabase(),
      cdnBaseUrl,
    ).getPublishedSelection()
  } catch (error) {
    // An error thrown inside the 'use cache' scope aborts a prerender even
    // when the caller catches it. On Vercel that is deliberate: a deploy
    // must fail loudly rather than silently ship an empty photos page. The
    // documented local build (shaped but unreachable DATABASE_URL) renders
    // the empty state instead. At runtime the rethrow lands in the caller's
    // catch, so a request never 500s over this read.
    if (process.env.VERCEL_ENV) throw error
    logReadFailure('read', error)
    return null
  }
}

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
  } catch (error) {
    logReadFailure('public read', error)
    return devFallback()
  }
}
