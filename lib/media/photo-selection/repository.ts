import 'server-only'

import { and, asc, eq, inArray } from 'drizzle-orm'

import type { getDatabase } from '~/db'
import {
  mediaActivePhotoPublication,
  mediaAssets,
  mediaPhotoSelectionDraftEntries,
  mediaPhotoSelectionDrafts,
  mediaPublishedPhotoSelectionEntries,
  mediaPublishedPhotoSelectionRenditions,
  mediaPublishedPhotoSelections,
  mediaRenditions,
  mediaUploadIntents,
} from '~/db/schema'

import { createPublicRenditionUrl } from '../storage/bunny'

import type {
  DraftPhotoSelection,
  PhotoSelectionRepository,
  PublishDraftRepositoryResult,
  SaveDraftRepositoryResult,
} from './service'

export type PhotoSelectionDatabase = ReturnType<typeof getDatabase>
type PhotoSelectionTransaction = Parameters<
  Parameters<PhotoSelectionDatabase['transaction']>[0]
>[0]

// The original public baseline remains readable while newly processed assets
// can carry additional high-density Renditions such as the 2560px profile.
const requiredProfiles = [640, 1024, 1600] as const
export const PUBLIC_PHOTO_SELECTION_CACHE_TAG = 'media:published-photo-selection'

type CandidateRow = {
  id: string
  catalogState: 'active' | 'archived' | 'purging'
  processingState:
    | 'upload_initiated'
    | 'original_verified'
    | 'processing'
    | 'ready'
    | 'retryable_failure'
    | 'repair_required'
  width: number | null
  height: number | null
  capturedAt: Date | null
  cameraMake: string | null
  cameraModel: string | null
  lens: string | null
  focalLengthMillimeters: string | null
  aperture: string | null
  shutterSpeedSeconds: string | null
  iso: number | null
  focalPointX: string | null
  focalPointY: string | null
  locationLabelZhHans: string | null
  locationLabelEn: string | null
  altTextZhHans: string | null
  altTextEn: string | null
  altTextApprovedAt: Date | null
  renditionProfileWidth: number | null
  renditionObjectKey: string | null
  renditionWidth: number | null
  renditionHeight: number | null
  renditionContentType: string | null
  renditionMetadataStripped: boolean | null
}

type Candidate = Omit<
  CandidateRow,
  | 'renditionProfileWidth'
  | 'renditionObjectKey'
  | 'renditionWidth'
  | 'renditionHeight'
  | 'renditionContentType'
  | 'renditionMetadataStripped'
> & {
  renditions: Array<{
    profileWidth: number
    objectKey: string
    width: number
    height: number
  }>
}

function collectCandidates(rows: CandidateRow[]) {
  const candidates = new Map<string, Candidate>()
  for (const row of rows) {
    let candidate = candidates.get(row.id)
    if (!candidate) {
      const {
        renditionProfileWidth: _profileWidth,
        renditionObjectKey: _objectKey,
        renditionWidth: _renditionWidth,
        renditionHeight: _renditionHeight,
        renditionContentType: _contentType,
        renditionMetadataStripped: _metadataStripped,
        ...asset
      } = row
      candidate = { ...asset, renditions: [] }
      candidates.set(row.id, candidate)
    }
    if (
      row.renditionProfileWidth !== null &&
      row.renditionObjectKey !== null &&
      row.renditionWidth !== null &&
      row.renditionHeight !== null &&
      row.renditionContentType === 'image/jpeg' &&
      row.renditionMetadataStripped === true
    ) {
      candidate.renditions.push({
        profileWidth: row.renditionProfileWidth,
        objectKey: row.renditionObjectKey,
        width: row.renditionWidth,
        height: row.renditionHeight,
      })
    }
  }
  return candidates
}

function candidateIsEligible(candidate: Candidate | undefined) {
  if (
    !candidate ||
    candidate.catalogState !== 'active' ||
    candidate.processingState !== 'ready' ||
    candidate.width === null ||
    candidate.height === null ||
    candidate.altTextApprovedAt === null ||
    !candidate.altTextZhHans?.trim() ||
    !candidate.altTextEn?.trim()
  ) {
    return false
  }
  const profiles = new Set(candidate.renditions.map(({ profileWidth }) => profileWidth))
  return requiredProfiles.every((profile) => profiles.has(profile))
}

function ineligibleAssetIds(ids: string[], candidates: Map<string, Candidate>) {
  return ids.filter((id) => !candidateIsEligible(candidates.get(id)))
}

async function loadCandidates(
  transaction: PhotoSelectionTransaction,
  ownerUserId: string,
  mediaAssetIds: string[],
) {
  if (mediaAssetIds.length === 0) return new Map<string, Candidate>()

  const rows = await transaction
    .select({
      id: mediaAssets.id,
      catalogState: mediaAssets.catalogState,
      processingState: mediaAssets.processingState,
      width: mediaAssets.width,
      height: mediaAssets.height,
      capturedAt: mediaAssets.capturedAt,
      cameraMake: mediaAssets.cameraMake,
      cameraModel: mediaAssets.cameraModel,
      lens: mediaAssets.lens,
      focalLengthMillimeters: mediaAssets.focalLengthMillimeters,
      aperture: mediaAssets.aperture,
      shutterSpeedSeconds: mediaAssets.shutterSpeedSeconds,
      iso: mediaAssets.iso,
      focalPointX: mediaAssets.focalPointX,
      focalPointY: mediaAssets.focalPointY,
      locationLabelZhHans: mediaAssets.locationLabelZhHans,
      locationLabelEn: mediaAssets.locationLabelEn,
      altTextZhHans: mediaAssets.altTextZhHans,
      altTextEn: mediaAssets.altTextEn,
      altTextApprovedAt: mediaAssets.altTextApprovedAt,
      renditionProfileWidth: mediaRenditions.profileWidth,
      renditionObjectKey: mediaRenditions.objectKey,
      renditionWidth: mediaRenditions.width,
      renditionHeight: mediaRenditions.height,
      renditionContentType: mediaRenditions.contentType,
      renditionMetadataStripped: mediaRenditions.metadataStripped,
    })
    .from(mediaAssets)
    .innerJoin(
      mediaUploadIntents,
      and(
        eq(mediaUploadIntents.id, mediaAssets.uploadIntentId),
        eq(mediaUploadIntents.ownerUserId, ownerUserId),
      ),
    )
    .innerJoin(mediaRenditions, eq(mediaRenditions.mediaAssetId, mediaAssets.id))
    .where(inArray(mediaAssets.id, mediaAssetIds))
    .for('share')
  return collectCandidates(rows)
}

export type PublicPhotoSelection = {
  revision: string
  publishedAt: Date
  count: number
  items: Array<{
    id: string
    width: number
    height: number
    altText: { zhHans: string; en: string }
    renditions: Array<{
      profileWidth: number
      src: string
      width: number
      height: number
    }>
    focalPoint?: { x: number; y: number }
    locationLabel?: { zhHans?: string; en?: string }
    capturedAt?: Date
    camera?: {
      make?: string
      model?: string
      lens?: string
      focalLengthMillimeters?: number
      aperture?: number
      shutterSpeedSeconds?: number
      iso?: number
    }
  }>
}

export function getHomepagePhotoPreview(selection: PublicPhotoSelection | null) {
  if (!selection) return null
  return {
    revision: selection.revision,
    publishedAt: selection.publishedAt,
    count: selection.count,
    items: selection.items.slice(0, 3),
  }
}

export function createPhotoSelectionRepository(
  database: () => PhotoSelectionDatabase,
): PhotoSelectionRepository {
  async function getDraft(ownerUserId: string): Promise<DraftPhotoSelection> {
    const [draft] = await database()
      .select()
      .from(mediaPhotoSelectionDrafts)
      .where(eq(mediaPhotoSelectionDrafts.ownerUserId, ownerUserId))
      .limit(1)
    if (!draft) return { revision: 0, mediaAssetIds: [], updatedAt: null }

    const entries = await database()
      .select({ mediaAssetId: mediaPhotoSelectionDraftEntries.mediaAssetId })
      .from(mediaPhotoSelectionDraftEntries)
      .where(eq(mediaPhotoSelectionDraftEntries.draftId, draft.id))
      .orderBy(asc(mediaPhotoSelectionDraftEntries.position))
    return {
      revision: draft.revision,
      mediaAssetIds: entries.map(({ mediaAssetId }) => mediaAssetId),
      updatedAt: draft.updatedAt,
    }
  }

  return {
    getDraft,

    async saveDraft(input): Promise<SaveDraftRepositoryResult> {
      try {
        return await database().transaction(async (transaction) => {
          const [current] = await transaction
            .select()
            .from(mediaPhotoSelectionDrafts)
            .where(eq(mediaPhotoSelectionDrafts.ownerUserId, input.ownerUserId))
            .limit(1)
            .for('update')
          const currentRevision = current?.revision ?? 0
          if (currentRevision !== input.expectedRevision) {
            return { status: 'revision_conflict', currentRevision }
          }

          const candidates = await loadCandidates(
            transaction,
            input.ownerUserId,
            input.mediaAssetIds,
          )
          const ineligibleMediaAssetIds = ineligibleAssetIds(
            input.mediaAssetIds,
            candidates,
          )
          if (ineligibleMediaAssetIds.length > 0) {
            return { status: 'ineligible_assets', ineligibleMediaAssetIds }
          }

          const nextRevision = currentRevision + 1
          let draftId: string
          if (current) {
            const [updated] = await transaction
              .update(mediaPhotoSelectionDrafts)
              .set({ revision: nextRevision, updatedAt: input.updatedAt })
              .where(
                and(
                  eq(mediaPhotoSelectionDrafts.id, current.id),
                  eq(mediaPhotoSelectionDrafts.revision, currentRevision),
                ),
              )
              .returning({ id: mediaPhotoSelectionDrafts.id })
            if (!updated) {
              throw new Error('Draft revision update failed')
            }
            draftId = updated.id
            await transaction
              .delete(mediaPhotoSelectionDraftEntries)
              .where(eq(mediaPhotoSelectionDraftEntries.draftId, draftId))
          } else {
            const [created] = await transaction
              .insert(mediaPhotoSelectionDrafts)
              .values({
                ownerUserId: input.ownerUserId,
                revision: nextRevision,
                createdAt: input.updatedAt,
                updatedAt: input.updatedAt,
              })
              .returning({ id: mediaPhotoSelectionDrafts.id })
            draftId = created!.id
          }
          if (input.mediaAssetIds.length > 0) {
            await transaction.insert(mediaPhotoSelectionDraftEntries).values(
              input.mediaAssetIds.map((mediaAssetId, position) => ({
                draftId,
                mediaAssetId,
                position,
                createdAt: input.updatedAt,
              })),
            )
          }
          return {
            status: 'saved',
            draft: {
              revision: nextRevision,
              mediaAssetIds: [...input.mediaAssetIds],
              updatedAt: input.updatedAt,
            },
          }
        })
      } catch (error) {
        const current = await getDraft(input.ownerUserId)
        if (current.revision !== input.expectedRevision) {
          return { status: 'revision_conflict', currentRevision: current.revision }
        }
        throw error
      }
    },

    async publishDraft(input): Promise<PublishDraftRepositoryResult> {
      try {
        return await database().transaction(async (transaction) => {
          const [existing] = await transaction
            .select()
            .from(mediaPublishedPhotoSelections)
            .where(
              and(
                eq(mediaPublishedPhotoSelections.ownerUserId, input.ownerUserId),
                eq(
                  mediaPublishedPhotoSelections.idempotencyKey,
                  input.idempotencyKey,
                ),
              ),
            )
            .limit(1)
          if (existing) {
            if (existing.draftRevision !== input.expectedDraftRevision) {
              return { status: 'idempotency_conflict' }
            }
            return {
              status: 'published',
              replayed: true,
              publishedSelectionId: existing.id,
              draftRevision: existing.draftRevision,
              itemCount: existing.itemCount,
              publishedAt: existing.publishedAt,
            }
          }

          const [existingRevision] = await transaction
            .select({ id: mediaPublishedPhotoSelections.id })
            .from(mediaPublishedPhotoSelections)
            .where(
              and(
                eq(mediaPublishedPhotoSelections.ownerUserId, input.ownerUserId),
                eq(
                  mediaPublishedPhotoSelections.draftRevision,
                  input.expectedDraftRevision,
                ),
              ),
            )
            .limit(1)
          if (existingRevision) {
            return { status: 'idempotency_conflict' }
          }

          const [draft] = await transaction
            .select()
            .from(mediaPhotoSelectionDrafts)
            .where(eq(mediaPhotoSelectionDrafts.ownerUserId, input.ownerUserId))
            .limit(1)
            .for('update')
          const currentRevision = draft?.revision ?? 0
          if (currentRevision !== input.expectedDraftRevision) {
            return { status: 'revision_conflict', currentRevision }
          }
          const entries = draft
            ? await transaction
                .select({ mediaAssetId: mediaPhotoSelectionDraftEntries.mediaAssetId })
                .from(mediaPhotoSelectionDraftEntries)
                .where(eq(mediaPhotoSelectionDraftEntries.draftId, draft.id))
                .orderBy(asc(mediaPhotoSelectionDraftEntries.position))
            : []
          const mediaAssetIds = entries.map(({ mediaAssetId }) => mediaAssetId)
          const candidates = await loadCandidates(
            transaction,
            input.ownerUserId,
            mediaAssetIds,
          )
          const ineligibleMediaAssetIds = ineligibleAssetIds(mediaAssetIds, candidates)
          if (ineligibleMediaAssetIds.length > 0) {
            return { status: 'ineligible_assets', ineligibleMediaAssetIds }
          }

          const [publication] = await transaction
            .insert(mediaPublishedPhotoSelections)
            .values({
              ownerUserId: input.ownerUserId,
              idempotencyKey: input.idempotencyKey,
              draftRevision: currentRevision,
              itemCount: mediaAssetIds.length,
              publishedAt: input.publishedAt,
            })
            .returning({ id: mediaPublishedPhotoSelections.id })

          if (mediaAssetIds.length > 0) {
            const publishedEntries = await transaction
              .insert(mediaPublishedPhotoSelectionEntries)
              .values(
                mediaAssetIds.map((mediaAssetId, position) => {
                  const candidate = candidates.get(mediaAssetId)!
                  return {
                    publishedSelectionId: publication!.id,
                    sourceMediaAssetId: candidate.id,
                    position,
                    width: candidate.width!,
                    height: candidate.height!,
                    focalPointX: candidate.focalPointX,
                    focalPointY: candidate.focalPointY,
                    altTextZhHans: candidate.altTextZhHans!,
                    altTextEn: candidate.altTextEn!,
                    locationLabelZhHans: candidate.locationLabelZhHans,
                    locationLabelEn: candidate.locationLabelEn,
                    capturedAt: candidate.capturedAt,
                    cameraMake: candidate.cameraMake,
                    cameraModel: candidate.cameraModel,
                    lens: candidate.lens,
                    focalLengthMillimeters: candidate.focalLengthMillimeters,
                    aperture: candidate.aperture,
                    shutterSpeedSeconds: candidate.shutterSpeedSeconds,
                    iso: candidate.iso,
                    createdAt: input.publishedAt,
                  }
                }),
              )
              .returning({
                id: mediaPublishedPhotoSelectionEntries.id,
                sourceMediaAssetId:
                  mediaPublishedPhotoSelectionEntries.sourceMediaAssetId,
              })
            const entryIdByMediaAssetId = new Map(
              publishedEntries.map(({ id, sourceMediaAssetId }) => [
                sourceMediaAssetId,
                id,
              ]),
            )
            await transaction.insert(mediaPublishedPhotoSelectionRenditions).values(
              mediaAssetIds.flatMap((mediaAssetId) => {
                const candidate = candidates.get(mediaAssetId)!
                return candidate.renditions
                  .toSorted((a, b) => a.profileWidth - b.profileWidth)
                  .map((rendition) => ({
                    publishedEntryId: entryIdByMediaAssetId.get(mediaAssetId)!,
                    ...rendition,
                    createdAt: input.publishedAt,
                  }))
              }),
            )
          }

          await transaction
            .insert(mediaActivePhotoPublication)
            .values({
              id: 1,
              publishedSelectionId: publication!.id,
              updatedAt: input.publishedAt,
            })
            .onConflictDoUpdate({
              target: mediaActivePhotoPublication.id,
              set: {
                publishedSelectionId: publication!.id,
                updatedAt: input.publishedAt,
              },
            })
          return {
            status: 'published',
            replayed: false,
            publishedSelectionId: publication!.id,
            draftRevision: currentRevision,
            itemCount: mediaAssetIds.length,
            publishedAt: input.publishedAt,
          }
        })
      } catch (error) {
        const [existing] = await database()
          .select()
          .from(mediaPublishedPhotoSelections)
          .where(
            and(
              eq(mediaPublishedPhotoSelections.ownerUserId, input.ownerUserId),
              eq(mediaPublishedPhotoSelections.idempotencyKey, input.idempotencyKey),
            ),
          )
          .limit(1)
        if (existing) {
          if (existing.draftRevision !== input.expectedDraftRevision) {
            return { status: 'idempotency_conflict' }
          }
          return {
            status: 'published',
            replayed: true,
            publishedSelectionId: existing.id,
            draftRevision: existing.draftRevision,
            itemCount: existing.itemCount,
            publishedAt: existing.publishedAt,
          }
        }
        const [existingRevision] = await database()
          .select({ id: mediaPublishedPhotoSelections.id })
          .from(mediaPublishedPhotoSelections)
          .where(
            and(
              eq(mediaPublishedPhotoSelections.ownerUserId, input.ownerUserId),
              eq(
                mediaPublishedPhotoSelections.draftRevision,
                input.expectedDraftRevision,
              ),
            ),
          )
          .limit(1)
        if (existingRevision) {
          return { status: 'idempotency_conflict' }
        }
        throw error
      }
    },
  }
}

export function createPublicPhotoSelectionRepository(
  database: () => PhotoSelectionDatabase,
  cdnBaseUrl: URL,
) {
  const publicRenditionUrl = createPublicRenditionUrl(cdnBaseUrl)
  return {
    async getPublishedSelection(): Promise<PublicPhotoSelection | null> {
      const [active] = await database()
        .select({
          id: mediaPublishedPhotoSelections.id,
          publishedAt: mediaPublishedPhotoSelections.publishedAt,
          itemCount: mediaPublishedPhotoSelections.itemCount,
        })
        .from(mediaActivePhotoPublication)
        .innerJoin(
          mediaPublishedPhotoSelections,
          eq(
            mediaPublishedPhotoSelections.id,
            mediaActivePhotoPublication.publishedSelectionId,
          ),
        )
        .where(eq(mediaActivePhotoPublication.id, 1))
        .limit(1)
      if (!active) return null

      const entries = await database()
        .select()
        .from(mediaPublishedPhotoSelectionEntries)
        .where(eq(mediaPublishedPhotoSelectionEntries.publishedSelectionId, active.id))
        .orderBy(asc(mediaPublishedPhotoSelectionEntries.position))
      if (entries.length !== active.itemCount) {
        throw new Error('Published Photo Selection snapshot is incomplete')
      }
      const renditionRows =
        entries.length === 0
          ? []
          : await database()
              .select()
              .from(mediaPublishedPhotoSelectionRenditions)
              .where(
                inArray(
                  mediaPublishedPhotoSelectionRenditions.publishedEntryId,
                  entries.map(({ id }) => id),
                ),
              )
              .orderBy(asc(mediaPublishedPhotoSelectionRenditions.profileWidth))
      const renditionsByEntry = Map.groupBy(
        renditionRows,
        ({ publishedEntryId }) => publishedEntryId,
      )

      return {
        revision: active.id,
        publishedAt: active.publishedAt,
        count: active.itemCount,
        items: entries.map((entry) => {
          const renditions = renditionsByEntry.get(entry.id) ?? []
          if (
            renditions.length < requiredProfiles.length ||
            !requiredProfiles.every((profile) =>
              renditions.some(({ profileWidth }) => profileWidth === profile),
            )
          ) {
            throw new Error('Published Photo Selection snapshot is incomplete')
          }
          const locationLabel = {
            ...(entry.locationLabelZhHans
              ? { zhHans: entry.locationLabelZhHans }
              : {}),
            ...(entry.locationLabelEn ? { en: entry.locationLabelEn } : {}),
          }
          const camera = {
            ...(entry.cameraMake ? { make: entry.cameraMake } : {}),
            ...(entry.cameraModel ? { model: entry.cameraModel } : {}),
            ...(entry.lens ? { lens: entry.lens } : {}),
            ...(entry.focalLengthMillimeters !== null
              ? {
                  focalLengthMillimeters: Number(entry.focalLengthMillimeters),
                }
              : {}),
            ...(entry.aperture !== null
              ? { aperture: Number(entry.aperture) }
              : {}),
            ...(entry.shutterSpeedSeconds !== null
              ? {
                  shutterSpeedSeconds: Number(entry.shutterSpeedSeconds),
                }
              : {}),
            ...(entry.iso !== null ? { iso: entry.iso } : {}),
          }
          return {
            id: entry.id,
            width: entry.width,
            height: entry.height,
            altText: {
              zhHans: entry.altTextZhHans,
              en: entry.altTextEn,
            },
            renditions: renditions.map((rendition) => ({
              profileWidth: rendition.profileWidth,
              src: publicRenditionUrl(rendition.objectKey),
              width: rendition.width,
              height: rendition.height,
            })),
            ...(entry.focalPointX !== null && entry.focalPointY !== null
              ? {
                  focalPoint: {
                    x: Number(entry.focalPointX),
                    y: Number(entry.focalPointY),
                  },
                }
              : {}),
            ...(Object.keys(locationLabel).length > 0 ? { locationLabel } : {}),
            ...(entry.capturedAt ? { capturedAt: entry.capturedAt } : {}),
            ...(Object.keys(camera).length > 0 ? { camera } : {}),
          }
        }),
      }
    },
  }
}
