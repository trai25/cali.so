import 'server-only'

import { and, asc, eq, inArray } from 'drizzle-orm'

import type { getDatabase } from '~/db'
import {
  mediaActivePhotoPublication,
  mediaPhotoSelectionDraftEntries,
  mediaPhotoSelectionDrafts,
  mediaPublishedPhotoSelectionEntries,
  mediaPublishedPhotoSelectionRenditions,
  mediaPublishedPhotoSelections,
} from '~/db/schema'

import { lockPhotoSelectionMutations } from '../catalog/lifecycle-locks'

export type MediaSelectionDatabase = ReturnType<typeof getDatabase>
export type MediaSelectionTransaction = Parameters<
  Parameters<MediaSelectionDatabase['transaction']>[0]
>[0]

export type SelectionWithdrawal = {
  draft: null | {
    id: string
    revisionBefore: number
    revisionAfter: number
    position: number
  }
  publication: null | {
    beforeId: string
    afterId: string
  }
}

async function replaceDraftEntries(
  transaction: MediaSelectionTransaction,
  input: {
    draftId: string
    mediaAssetIds: string[]
    at: Date
  },
) {
  await transaction
    .delete(mediaPhotoSelectionDraftEntries)
    .where(eq(mediaPhotoSelectionDraftEntries.draftId, input.draftId))
  if (input.mediaAssetIds.length === 0) return
  await transaction.insert(mediaPhotoSelectionDraftEntries).values(
    input.mediaAssetIds.map((mediaAssetId, position) => ({
      draftId: input.draftId,
      mediaAssetId,
      position,
      createdAt: input.at,
    })),
  )
}

async function withdrawFromDraft(
  transaction: MediaSelectionTransaction,
  input: { ownerUserId: string; mediaAssetId: string; at: Date },
) {
  const [draft] = await transaction
    .select()
    .from(mediaPhotoSelectionDrafts)
    .where(eq(mediaPhotoSelectionDrafts.ownerUserId, input.ownerUserId))
    .limit(1)
    .for('update')
  if (!draft) return null

  const entries = await transaction
    .select({ mediaAssetId: mediaPhotoSelectionDraftEntries.mediaAssetId })
    .from(mediaPhotoSelectionDraftEntries)
    .where(eq(mediaPhotoSelectionDraftEntries.draftId, draft.id))
    .orderBy(asc(mediaPhotoSelectionDraftEntries.position))
  const position = entries.findIndex(
    ({ mediaAssetId }) => mediaAssetId === input.mediaAssetId,
  )
  if (position < 0) return null

  const revisionAfter = draft.revision + 1
  await replaceDraftEntries(transaction, {
    draftId: draft.id,
    mediaAssetIds: entries
      .map(({ mediaAssetId }) => mediaAssetId)
      .filter((mediaAssetId) => mediaAssetId !== input.mediaAssetId),
    at: input.at,
  })
  await transaction
    .update(mediaPhotoSelectionDrafts)
    .set({ revision: revisionAfter, updatedAt: input.at })
    .where(
      and(
        eq(mediaPhotoSelectionDrafts.id, draft.id),
        eq(mediaPhotoSelectionDrafts.revision, draft.revision),
      ),
    )

  return {
    id: draft.id,
    revisionBefore: draft.revision,
    revisionAfter,
    position,
  }
}

async function withdrawFromPublication(
  transaction: MediaSelectionTransaction,
  input: {
    ownerUserId: string
    mediaAssetId: string
    idempotencyKey: string
    at: Date
  },
) {
  const [active] = await transaction
    .select({ publishedSelectionId: mediaActivePhotoPublication.publishedSelectionId })
    .from(mediaActivePhotoPublication)
    .where(eq(mediaActivePhotoPublication.id, 1))
    .limit(1)
    .for('update')
  if (!active) return null

  const [publication] = await transaction
    .select()
    .from(mediaPublishedPhotoSelections)
    .where(
      and(
        eq(mediaPublishedPhotoSelections.id, active.publishedSelectionId),
        eq(mediaPublishedPhotoSelections.ownerUserId, input.ownerUserId),
      ),
    )
    .limit(1)
  if (!publication) return null

  const entries = await transaction
    .select()
    .from(mediaPublishedPhotoSelectionEntries)
    .where(
      eq(
        mediaPublishedPhotoSelectionEntries.publishedSelectionId,
        publication.id,
      ),
    )
    .orderBy(asc(mediaPublishedPhotoSelectionEntries.position))
  if (
    !entries.some(
      ({ sourceMediaAssetId }) => sourceMediaAssetId === input.mediaAssetId,
    )
  ) {
    return null
  }

  const retained = entries.filter(
    ({ sourceMediaAssetId }) => sourceMediaAssetId !== input.mediaAssetId,
  )
  const [nextPublication] = await transaction
    .insert(mediaPublishedPhotoSelections)
    .values({
      ownerUserId: input.ownerUserId,
      idempotencyKey: input.idempotencyKey,
      publicationKind: 'withdrawal',
      draftRevision: null,
      itemCount: retained.length,
      publishedAt: input.at,
    })
    .returning({ id: mediaPublishedPhotoSelections.id })

  if (retained.length > 0) {
    const insertedEntries = await transaction
      .insert(mediaPublishedPhotoSelectionEntries)
      .values(
        retained.map(
          (
            {
              id: _id,
              publishedSelectionId: _publishedSelectionId,
              position: _position,
              createdAt: _createdAt,
              ...entry
            },
            position,
          ) => ({
            ...entry,
            publishedSelectionId: nextPublication!.id,
            position,
            createdAt: input.at,
          }),
        ),
      )
      .returning({
        id: mediaPublishedPhotoSelectionEntries.id,
        sourceMediaAssetId: mediaPublishedPhotoSelectionEntries.sourceMediaAssetId,
      })
    const newEntryByAssetId = new Map(
      insertedEntries.map(({ id, sourceMediaAssetId }) => [sourceMediaAssetId, id]),
    )
    const oldEntryByAssetId = new Map(
      retained.map(({ id, sourceMediaAssetId }) => [sourceMediaAssetId, id]),
    )
    const renditions = await transaction
      .select()
      .from(mediaPublishedPhotoSelectionRenditions)
      .where(
        inArray(
          mediaPublishedPhotoSelectionRenditions.publishedEntryId,
          [...oldEntryByAssetId.values()],
        ),
      )
    if (renditions.length > 0) {
      const assetIdByOldEntry = new Map(
        [...oldEntryByAssetId].map(([mediaAssetId, entryId]) => [
          entryId,
          mediaAssetId,
        ]),
      )
      await transaction.insert(mediaPublishedPhotoSelectionRenditions).values(
        renditions.map(
          ({ id: _id, publishedEntryId, createdAt: _createdAt, ...rendition }) => ({
            ...rendition,
            publishedEntryId: newEntryByAssetId.get(
              assetIdByOldEntry.get(publishedEntryId)!,
            )!,
            createdAt: input.at,
          }),
        ),
      )
    }
  }

  await transaction
    .update(mediaActivePhotoPublication)
    .set({ publishedSelectionId: nextPublication!.id, updatedAt: input.at })
    .where(
      and(
        eq(mediaActivePhotoPublication.id, 1),
        eq(mediaActivePhotoPublication.publishedSelectionId, publication.id),
      ),
    )

  return { beforeId: publication.id, afterId: nextPublication!.id }
}

export async function withdrawMediaAssetFromSelections(
  transaction: MediaSelectionTransaction,
  input: {
    ownerUserId: string
    mediaAssetId: string
    idempotencyKey: string
    at: Date
  },
): Promise<SelectionWithdrawal> {
  await lockPhotoSelectionMutations(transaction, input.ownerUserId)
  const draft = await withdrawFromDraft(transaction, input)
  const publication = await withdrawFromPublication(transaction, input)
  return { draft, publication }
}

export async function restoreMediaAssetSelections(
  transaction: MediaSelectionTransaction,
  input: {
    ownerUserId: string
    mediaAssetId: string
    draft: SelectionWithdrawal['draft']
    publication: SelectionWithdrawal['publication']
    at: Date
  },
) {
  await lockPhotoSelectionMutations(transaction, input.ownerUserId)
  let lockedDraft: typeof mediaPhotoSelectionDrafts.$inferSelect | null = null
  let draftEntryIds: string[] = []
  if (input.draft) {
    const [draft] = await transaction
      .select()
      .from(mediaPhotoSelectionDrafts)
      .where(
        and(
          eq(mediaPhotoSelectionDrafts.id, input.draft.id),
          eq(mediaPhotoSelectionDrafts.ownerUserId, input.ownerUserId),
        ),
      )
      .limit(1)
      .for('update')
    if (!draft || draft.revision !== input.draft.revisionAfter) return false
    lockedDraft = draft
    const entries = await transaction
      .select({ mediaAssetId: mediaPhotoSelectionDraftEntries.mediaAssetId })
      .from(mediaPhotoSelectionDraftEntries)
      .where(eq(mediaPhotoSelectionDraftEntries.draftId, draft.id))
      .orderBy(asc(mediaPhotoSelectionDraftEntries.position))
    draftEntryIds = entries.map(({ mediaAssetId }) => mediaAssetId)
  }

  if (input.publication) {
    const [active] = await transaction
      .select({ publishedSelectionId: mediaActivePhotoPublication.publishedSelectionId })
      .from(mediaActivePhotoPublication)
      .where(eq(mediaActivePhotoPublication.id, 1))
      .limit(1)
      .for('update')
    if (active?.publishedSelectionId !== input.publication.afterId) return false
  }

  // Validate and lock every revision before mutating either selection. A
  // conflict must leave both Draft and Published membership untouched.
  if (input.draft && lockedDraft) {
    draftEntryIds.splice(input.draft.position, 0, input.mediaAssetId)
    await replaceDraftEntries(transaction, {
      draftId: lockedDraft.id,
      mediaAssetIds: draftEntryIds,
      at: input.at,
    })
    await transaction
      .update(mediaPhotoSelectionDrafts)
      .set({ revision: lockedDraft.revision + 1, updatedAt: input.at })
      .where(
        and(
          eq(mediaPhotoSelectionDrafts.id, lockedDraft.id),
          eq(mediaPhotoSelectionDrafts.revision, lockedDraft.revision),
        ),
      )
  }

  if (input.publication) {
    await transaction
      .update(mediaActivePhotoPublication)
      .set({ publishedSelectionId: input.publication.beforeId, updatedAt: input.at })
      .where(eq(mediaActivePhotoPublication.id, 1))
  }
  return true
}
