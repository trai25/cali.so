import 'server-only'

import { sql } from 'drizzle-orm'

import type { getDatabase } from '~/db'

type MediaLifecycleDatabase = ReturnType<typeof getDatabase>
export type MediaLifecycleTransaction = Parameters<
  Parameters<MediaLifecycleDatabase['transaction']>[0]
>[0]

async function lockLifecycleKey(
  transaction: MediaLifecycleTransaction,
  key: string,
) {
  await transaction.execute(
    sql`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))`,
  )
}

/**
 * Every Draft/Published mutation takes this owner-scoped lock before touching
 * Media Asset rows. It gives Archive, Undo, Purge, Save, and Publish one lock
 * order even when the owner has no Draft or active Publication row yet.
 */
export function lockPhotoSelectionMutations(
  transaction: MediaLifecycleTransaction,
  ownerUserId: string,
) {
  return lockLifecycleKey(transaction, `media:photo-selection:${ownerUserId}`)
}

/**
 * A processing write and Discard/Purge cannot overlap for the same asset.
 * Storage work runs while this transaction-scoped lock is held, so a Discard
 * sees every committed Rendition manifest and no later write can escape it.
 */
export function lockMediaAssetProcessing(
  transaction: MediaLifecycleTransaction,
  mediaAssetId: string,
) {
  return lockLifecycleKey(transaction, `media:asset-processing:${mediaAssetId}`)
}
