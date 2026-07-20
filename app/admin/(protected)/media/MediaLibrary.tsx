'use client'

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent,
} from 'react'

import {
  TransferDialog,
  type QueueItem,
  type TransferDiscardTarget,
} from './TransferDialog'

import { PixelCluster } from '~/components/pixel-cluster'
import { Button } from '~/components/ui/button'
import {
  Dialog,
  DialogBody,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '~/components/ui/dialog'
import { Input } from '~/components/ui/input'
import { TabItem, Tabs, TabsList } from '~/components/ui/tabs'
import { adminResponseJson } from '~/lib/admin/client-response'
import { T } from '~/lib/i18n'
import { localize, useLocale } from '~/lib/locale-client'
import { isMediaAssetEligible } from '~/lib/media/asset-review/eligibility'
import type { MediaAssetReviewRecord } from '~/lib/media/asset-review/service'
import {
  MAX_ORIGINAL_UPLOAD_BYTES,
  MAX_ORIGINAL_UPLOAD_CHUNK_BYTES,
  originalUploadChunkCount,
} from '~/lib/media/storage/transfer'
import { uploadChunkWithRetry } from '~/lib/media/transfer/client'
import type { TransferJob } from '~/lib/media/transfer/service'

type LibraryView = 'active' | 'archived'

const acceptedTypes = new Set([
  'image/heic',
  'image/heif',
  'image/jpeg',
  'image/png',
])

function fileContentType(file: File) {
  if (acceptedTypes.has(file.type)) return file.type
  const extension = file.name.split('.').pop()?.toLowerCase()
  if (extension === 'heic') return 'image/heic'
  if (extension === 'heif') return 'image/heif'
  if (extension === 'jpg' || extension === 'jpeg') return 'image/jpeg'
  if (extension === 'png') return 'image/png'
  return null
}

async function checksum(blob: Blob) {
  const bytes = await blob.arrayBuffer()
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('')
}

function uploadReplayStorageKey(input: {
  checksumSha256: string
  byteSize: number
  contentType: string
}) {
  return `cali:media-upload:v1:${input.checksumSha256}:${input.byteSize}:${input.contentType}`
}

function durableUploadIdempotencyKey(input: {
  checksumSha256: string
  byteSize: number
  contentType: string
}) {
  const storageKey = uploadReplayStorageKey(input)
  try {
    const existing = localStorage.getItem(storageKey)
    if (existing) return existing
    const created = crypto.randomUUID()
    localStorage.setItem(storageKey, created)
    return created
  } catch {
    return crypto.randomUUID()
  }
}

function clearDurableUploadIdempotencyKey(input: {
  checksumSha256: string
  byteSize: number
  contentType: string
}) {
  try {
    localStorage.removeItem(uploadReplayStorageKey(input))
  } catch {
    // Storage access is optional; server-side idempotency still protects a retry.
  }
}

function assetName(asset: MediaAssetReviewRecord) {
  return (
    asset.locationLabelEn ||
    asset.locationLabelZhHans ||
    asset.altTextEn ||
    asset.altTextZhHans ||
    asset.id.slice(0, 8)
  )
}

function assetNameIsIdFallback(asset: MediaAssetReviewRecord) {
  return !(
    asset.locationLabelEn ||
    asset.locationLabelZhHans ||
    asset.altTextEn ||
    asset.altTextZhHans
  )
}

function processingLabel(asset: MediaAssetReviewRecord) {
  if (asset.catalogState === 'purging') return { zh: '正在永久清除', en: 'Purging' }
  if (asset.catalogState === 'archived') return { zh: '已归档', en: 'Archived' }
  const labels = {
    upload_initiated: { zh: '等待上传', en: 'Upload initiated' },
    original_verified: { zh: '原片已验证', en: 'Original verified' },
    processing: { zh: '处理中', en: 'Processing' },
    ready: { zh: '就绪', en: 'Ready' },
    retryable_failure: { zh: '可重试', en: 'Retry available' },
    repair_required: { zh: '需要处理', en: 'Repair required' },
  } as const
  return labels[asset.processingState]
}

/**
 * Amber while a photo is not yet publishable (processing, or Alt Text
 * still missing — e.g. the auto-approval could not run), red when the
 * pipeline needs a hand.
 */
function statusTone(asset: MediaAssetReviewRecord): 'busy' | 'attention' | null {
  if (asset.catalogState === 'purging') return 'attention'
  if (
    asset.processingState === 'retryable_failure' ||
    asset.processingState === 'repair_required'
  ) {
    return 'attention'
  }
  if (asset.processingState !== 'ready') return 'busy'
  if (asset.catalogState === 'active' && !isMediaAssetEligible(asset)) {
    return 'busy'
  }
  return null
}

function Inspector({
  asset,
  onArchiveUndo,
  onUpdated,
  onClose,
}: {
  asset: MediaAssetReviewRecord
  onArchiveUndo(asset: MediaAssetReviewRecord, operationId: string): void
  onUpdated(asset: MediaAssetReviewRecord | null): void
  onClose(): void
}) {
  const locale = useLocale()
  const [locationZh, setLocationZh] = useState(asset.locationLabelZhHans ?? '')
  const [locationEn, setLocationEn] = useState(asset.locationLabelEn ?? '')
  const [altZh, setAltZh] = useState(
    asset.altTextZhHans ?? asset.altTextSuggestion?.zhHans ?? '',
  )
  const [altEn, setAltEn] = useState(
    asset.altTextEn ?? asset.altTextSuggestion?.en ?? '',
  )
  const [focalPoint, setFocalPoint] = useState(asset.focalPoint)
  const [pending, setPending] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [purgeOpen, setPurgeOpen] = useState(false)
  const noticeRef = useRef<HTMLParagraphElement>(null)

  useEffect(() => {
    if (notice) noticeRef.current?.focus()
  }, [notice])

  async function mutate(body: Record<string, unknown>) {
    const response = await fetch(`/api/admin/media/assets/${asset.id}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })
    return adminResponseJson(response)
  }

  // One save: display metadata and Alt Text go out together; untouched
  // halves are skipped so the request count matches the actual edits.
  async function save() {
    setPending('save')
    setNotice(null)
    const metadataChanged =
      (locationZh.trim() || null) !== asset.locationLabelZhHans ||
      (locationEn.trim() || null) !== asset.locationLabelEn ||
      focalPoint?.x !== asset.focalPoint?.x ||
      focalPoint?.y !== asset.focalPoint?.y
    const altChanged =
      altZh.trim() !== (asset.altTextZhHans ?? '') ||
      altEn.trim() !== (asset.altTextEn ?? '')
    try {
      let latest: MediaAssetReviewRecord | null = null
      if (metadataChanged) {
        const body = await mutate({
          intent: 'update_display_metadata',
          locationLabelZhHans: locationZh.trim() || null,
          locationLabelEn: locationEn.trim() || null,
          focalPoint,
        })
        latest = body.asset as MediaAssetReviewRecord
      }
      if (altChanged) {
        if (!altZh.trim() || !altEn.trim()) {
          setNotice(
            localize(
              locale,
              '中英文替代文本都需要填写。',
              'Alt Text needs both languages.',
            ),
          )
          setPending(null)
          return
        }
        const body = await mutate({
          intent: 'approve_alt_text',
          zhHans: altZh.trim(),
          en: altEn.trim(),
        })
        latest = body.asset as MediaAssetReviewRecord
      }
      if (latest) onUpdated(latest)
      setNotice(
        metadataChanged || altChanged
          ? localize(locale, '已保存。', 'Saved.')
          : localize(locale, '没有需要保存的更改。', 'Nothing to save.'),
      )
    } catch {
      setNotice(localize(locale, '无法保存，请重试。', 'Could not save. Try again.'))
    } finally {
      setPending(null)
    }
  }

  async function regenerate() {
    setPending('suggestion')
    setNotice(null)
    try {
      const response = await fetch(`/api/admin/media/assets/${asset.id}/alt-text`, {
        method: 'POST',
      })
      const body = await adminResponseJson(response)
      const suggestion = body.suggestion as { zhHans: string; en: string }
      setAltZh(suggestion.zhHans)
      setAltEn(suggestion.en)
      if (body.asset) onUpdated(body.asset as MediaAssetReviewRecord)
      setNotice(
        localize(locale, '已生成新的建议，保存后生效。', 'New suggestion ready — save to apply.'),
      )
    } catch {
      setNotice(
        localize(locale, '暂时无法生成建议。', 'Suggestion unavailable right now.'),
      )
    } finally {
      setPending(null)
    }
  }

  async function suggestLocationLabel() {
    setPending('location')
    setNotice(null)
    try {
      const response = await fetch(
        `/api/admin/media/assets/${asset.id}/location-label`,
        { method: 'POST' },
      )
      const body = await adminResponseJson(response)
      const suggestion = body.suggestion as { zhHans?: string; en?: string }
      if (suggestion.zhHans) setLocationZh(suggestion.zhHans)
      if (suggestion.en) setLocationEn(suggestion.en)
      setNotice(
        localize(
          locale,
          '已根据私密拍摄位置填写，保存后生效。',
          'Filled from the private Capture Location — save to apply.',
        ),
      )
    } catch (error) {
      const code = error instanceof Error ? error.message : ''
      setNotice(
        code === 'no_capture_location'
          ? localize(
              locale,
              '这个文件没有 GPS 拍摄位置，请手动填写。',
              'No GPS Capture Location on this file. Enter the label manually.',
            )
          : code === 'no_results'
            ? localize(
                locale,
                '找不到这个位置的地点名称，请手动填写。',
                'No place name found for this location. Enter the label manually.',
              )
            : localize(
                locale,
                '暂时无法查询地点名称，请稍后重试。',
                'Place lookup is unavailable right now. Try again later.',
              ),
      )
    } finally {
      setPending(null)
    }
  }

  async function resumeProcessing() {
    setPending('resume')
    setNotice(null)
    try {
      const response = await fetch(`/api/admin/media/assets/${asset.id}/resume`, {
        method: 'POST',
      })
      const body = await adminResponseJson(response)
      onUpdated(body.asset as MediaAssetReviewRecord)
      setNotice(
        localize(
          locale,
          '处理已恢复；已确认的步骤不会重复执行。',
          'Processing resumed without repeating confirmed steps.',
        ),
      )
    } catch {
      setNotice(
        localize(
          locale,
          '暂时无法恢复处理，请稍后重试。',
          'Processing could not resume yet. Try again later.',
        ),
      )
    } finally {
      setPending(null)
    }
  }

  async function changeCatalogState(intent: 'archive' | 'restore') {
    setPending(intent)
    setNotice(null)
    try {
      const body = await mutate({ intent })
      const updated = body.asset as MediaAssetReviewRecord
      onUpdated(updated)
      if (intent === 'archive' && typeof body.undoOperationId === 'string') {
        onArchiveUndo(updated, body.undoOperationId)
      }
      setNotice(
        intent === 'archive'
          ? localize(locale, '已归档。', 'Archived.')
          : localize(locale, '已恢复。', 'Restored.'),
      )
    } catch {
      setNotice(
        localize(
          locale,
          '暂时无法更新，请重试。',
          'Could not update this Media Asset. Try again.',
        ),
      )
    } finally {
      setPending(null)
    }
  }

  async function purge() {
    setPending('purge')
    setNotice(null)
    try {
      const response = await fetch(`/api/admin/media/assets/${asset.id}/purge`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ confirmation: 'PURGE' }),
      })
      await adminResponseJson(response)
      setPurgeOpen(false)
      onUpdated(null)
      onClose()
    } catch {
      setNotice(
        localize(
          locale,
          '清除未完成。已确认的步骤已保存，可以安全重试。',
          'Purge is incomplete. Confirmed progress was saved and can be retried safely.',
        ),
      )
    } finally {
      setPending(null)
    }
  }

  function chooseFocalPoint(event: MouseEvent<HTMLButtonElement>) {
    if (event.detail === 0) {
      setFocalPoint((current) => current ?? { x: 0.5, y: 0.5 })
      return
    }
    const bounds = event.currentTarget.getBoundingClientRect()
    setFocalPoint({
      x: Number(((event.clientX - bounds.left) / bounds.width).toFixed(4)),
      y: Number(((event.clientY - bounds.top) / bounds.height).toFixed(4)),
    })
  }

  function moveFocalPoint(event: KeyboardEvent<HTMLButtonElement>) {
    const movement = {
      ArrowLeft: { x: -0.05, y: 0 },
      ArrowRight: { x: 0.05, y: 0 },
      ArrowUp: { x: 0, y: -0.05 },
      ArrowDown: { x: 0, y: 0.05 },
    }[event.key]
    if (!movement) return
    event.preventDefault()
    setFocalPoint((current) => {
      const point = current ?? { x: 0.5, y: 0.5 }
      return {
        x: Math.min(1, Math.max(0, Number((point.x + movement.x).toFixed(4)))),
        y: Math.min(1, Math.max(0, Number((point.y + movement.y).toFixed(4)))),
      }
    })
  }

  const captured = asset.capturedAt
    ? new Intl.DateTimeFormat(locale === 'zh' ? 'zh-CN' : 'en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      }).format(new Date(asset.capturedAt))
    : null
  // The capture data as spec-plate fields — the same register the
  // published wall's lightbox uses; only non-null cells render.
  const cameraBody = [asset.cameraMake, asset.cameraModel]
    .filter(Boolean)
    .join(' ')
  const captureFields: { zh: string; en: string; value: string }[] = [
    ...(captured ? [{ zh: '日期', en: 'Date', value: captured }] : []),
    ...(cameraBody ? [{ zh: '相机', en: 'Camera', value: cameraBody }] : []),
    ...(asset.lens ? [{ zh: '镜头', en: 'Lens', value: asset.lens }] : []),
    ...(asset.focalLengthMillimeters
      ? [{ zh: '焦距', en: 'Focal', value: `${asset.focalLengthMillimeters} mm` }]
      : []),
    ...(asset.aperture
      ? [{ zh: '光圈', en: 'Aperture', value: `ƒ/${asset.aperture}` }]
      : []),
    ...(asset.shutterSpeedSeconds
      ? [
          {
            zh: '快门',
            en: 'Shutter',
            value:
              asset.shutterSpeedSeconds < 1
                ? `1/${Math.round(1 / asset.shutterSpeedSeconds)} s`
                : `${asset.shutterSpeedSeconds} s`,
          },
        ]
      : []),
    ...(asset.iso ? [{ zh: '感光度', en: 'ISO', value: String(asset.iso) }] : []),
  ]
  const editable = asset.catalogState === 'active'

  return (
    <>
      <div className="flex items-baseline justify-between gap-4">
        <DialogTitle
          className={
            assetNameIsIdFallback(asset)
              ? 'min-w-0 truncate font-mono'
              : 'min-w-0 truncate'
          }
        >
          {assetName(asset)}
        </DialogTitle>
        <p className="shrink-0 text-sm text-muted-foreground">
          <T zh={processingLabel(asset).zh} en={processingLabel(asset).en} />
        </p>
      </div>

      {['original_verified', 'processing', 'retryable_failure'].includes(
        asset.processingState,
      ) && (
        <Button
          type="button"
          variant="tertiary"
          size="md"
          className="mt-4"
          loading={pending === 'resume'}
          disabled={pending !== null || !editable}
          onClick={resumeProcessing}
        >
          <T zh="恢复处理" en="Resume processing" />
        </Button>
      )}

      {asset.previewRendition && (
        <>
          <button
            type="button"
            disabled={!editable}
            onClick={chooseFocalPoint}
            onKeyDown={moveFocalPoint}
            aria-label={localize(locale, '设置焦点', 'Set Focal Point')}
            className="relative mt-4 block w-full overflow-hidden rounded-md bg-surface-1 outline-none disabled:opacity-70 focus-visible:ring-1 focus-visible:ring-foreground"
          >
            {/* Bunny is the delivery and cache layer for Renditions. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={asset.previewRendition.src}
              alt=""
              width={asset.previewRendition.width}
              height={asset.previewRendition.height}
              className="h-auto w-full"
            />
            {focalPoint && (
              <span
                className="absolute h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-black shadow-sm"
                style={{
                  left: `${focalPoint.x * 100}%`,
                  top: `${focalPoint.y * 100}%`,
                }}
              />
            )}
          </button>
          <p className="mt-2 text-sm leading-5 text-muted-foreground">
            <T
              zh="点击照片设置裁切焦点，方向键微调。"
              en="Click to set the crop Focal Point; arrow keys nudge it."
            />
          </p>
        </>
      )}

      {captureFields.length > 0 && (
        <dl className="spec-plate spec-plate-flow mt-3">
          {captureFields.map((field) => (
            <div key={field.en}>
              <dt>
                <T zh={field.zh} en={field.en} />
              </dt>
              <dd>{field.value}</dd>
            </div>
          ))}
        </dl>
      )}

      <div className="mt-5 grid gap-4 hairline-top pt-4">
        <div className="flex items-baseline justify-between gap-3">
          <h3 className="text-sm font-medium">
            <T zh="地点" en="Location" />
          </h3>
          {asset.hasCaptureLocation && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              loading={pending === 'location'}
              disabled={pending !== null || !editable}
              onClick={suggestLocationLabel}
            >
              <T zh="根据拍摄位置填写" en="Fill from Capture Location" />
            </Button>
          )}
        </div>
        <Input
          label={<T zh="地点（中文）" en="Location (Chinese)" />}
          value={locationZh}
          onChange={(event) => setLocationZh(event.target.value)}
        />
        <Input
          label={<T zh="地点（英文）" en="Location (English)" />}
          value={locationEn}
          onChange={(event) => setLocationEn(event.target.value)}
        />
      </div>

      <div className="mt-5 grid gap-4 hairline-top pt-4">
        <div className="flex items-baseline justify-between gap-3">
          <h3 className="text-sm font-medium">
            <T zh="替代文本" en="Alt Text" />
          </h3>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            loading={pending === 'suggestion'}
            disabled={pending !== null || !editable}
            onClick={regenerate}
          >
            <T zh="重新生成" en="Regenerate" />
          </Button>
        </div>
        <Input
          label={<T zh="替代文本（中文）" en="Alt Text (Chinese)" />}
          value={altZh}
          onChange={(event) => setAltZh(event.target.value)}
        />
        <Input
          label={<T zh="替代文本（英文）" en="Alt Text (English)" />}
          value={altEn}
          onChange={(event) => setAltEn(event.target.value)}
        />
      </div>

      {notice && (
        <p
          ref={noticeRef}
          role="status"
          tabIndex={-1}
          className="mt-4 text-sm leading-5 text-muted-foreground outline-none"
        >
          {notice}
        </p>
      )}

      <div className="mt-5 flex flex-wrap items-center justify-between gap-3 hairline-top pt-4">
        <div className="flex flex-wrap items-center gap-2">
          {asset.catalogState === 'active' && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={pending !== null}
              onClick={() => void changeCatalogState('archive')}
            >
              <T zh="归档" en="Archive" />
            </Button>
          )}
          {asset.catalogState === 'archived' && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={pending !== null}
              onClick={() => void changeCatalogState('restore')}
            >
              <T zh="恢复" en="Restore" />
            </Button>
          )}
          {(asset.catalogState === 'archived' ||
            asset.catalogState === 'purging') && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              destructive
              disabled={pending !== null}
              onClick={() => setPurgeOpen(true)}
            >
              {asset.catalogState === 'purging' ? (
                <T zh="重试清除" en="Retry Purge" />
              ) : (
                <T zh="永久清除" en="Purge" />
              )}
            </Button>
          )}
        </div>
        {editable && (
          <Button
            type="button"
            variant="primary"
            size="md"
            expandHitArea
            loading={pending === 'save'}
            disabled={pending !== null}
            onClick={() => void save()}
          >
            <T zh="保存" en="Save" />
          </Button>
        )}
      </div>

      {asset.catalogState !== 'active' && (
        <p className="mt-3 text-sm leading-5 text-muted-foreground">
          <T
            zh="归档不会撤销已知的成品 URL；只有永久清除完成后才会删除文件和 CDN 缓存。"
            en="Archive does not revoke a known Rendition URL. Files and CDN cache are removed only after Purge completes."
          />
        </p>
      )}

      <Dialog open={purgeOpen} onOpenChange={setPurgeOpen}>
        <DialogContent size="sm" className="h-64">
          <DialogHeader>
            <DialogTitle>
              <T zh="永久清除素材" en="Purge Media Asset" />
            </DialogTitle>
            <DialogClose disabled={pending === 'purge'}>
              <T zh="取消" en="Cancel" />
            </DialogClose>
          </DialogHeader>
          <DialogDescription>
            <T
              zh="原片、成品和目录记录会永久删除。如果它仍在照片选集中，系统会只撤下这一张，不会发布其他草稿更改。"
              en="The Original, Renditions, and catalog record will be permanently removed. If selected, only this photo is withdrawn; unrelated Draft changes stay unpublished."
            />
          </DialogDescription>
          <DialogBody>
            <p className="text-sm leading-6 text-muted-foreground">
              <T zh="此操作无法撤销。" en="This action cannot be undone." />
            </p>
          </DialogBody>
          <DialogFooter>
            <Button
              type="button"
              variant="primary"
              size="md"
              destructive
              loading={pending === 'purge'}
              disabled={pending !== null}
              onClick={() => void purge()}
            >
              <T zh="永久清除" en="Purge" />
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

// The archive: drop photos in, everything laid out. Uploads keep the full
// durable pipeline (checksum → intent → same-origin transfer → synchronous
// processing → auto-approved AI Alt Text); the grid is a contact sheet and
// review is an inspector you open only when a photo needs a human touch.
export function MediaLibrary({
  initialActive,
  initialArchived,
  initialTransfers,
  selectionIds,
}: {
  initialActive: MediaAssetReviewRecord[]
  initialArchived: MediaAssetReviewRecord[]
  initialTransfers: TransferJob[]
  selectionIds: string[]
}) {
  const locale = useLocale()
  const [active, setActive] = useState(initialActive)
  const [archived, setArchived] = useState(initialArchived)
  const [transfers, setTransfers] = useState(initialTransfers)
  const [view, setView] = useState<LibraryView>('active')
  const [queue, setQueue] = useState<QueueItem[]>([])
  const [transferOpen, setTransferOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [openId, setOpenId] = useState<string | null>(null)
  const [archiveUndo, setArchiveUndo] = useState<{
    assetId: string
    operationId: string
  } | null>(null)
  const [discardTarget, setDiscardTarget] =
    useState<TransferDiscardTarget | null>(null)
  const [pendingTransferId, setPendingTransferId] = useState<string | null>(null)
  const [transferNotices, setTransferNotices] = useState<Record<string, string>>(
    {},
  )
  const queueTimersRef = useRef<number[]>([])
  const cancelingTransferIdsRef = useRef(new Set<string>())
  const archiveUndoTimerRef = useRef<number | null>(null)

  useEffect(
    () => () => {
      for (const timer of queueTimersRef.current) window.clearTimeout(timer)
      if (archiveUndoTimerRef.current !== null) {
        window.clearTimeout(archiveUndoTimerRef.current)
      }
    },
    [],
  )

  const assets = view === 'active' ? active : archived
  const visibleAssets = useMemo(() => {
    const query = search.trim().toLowerCase()
    if (!query) return assets
    return assets.filter((asset) =>
      [
        asset.id,
        asset.locationLabelEn,
        asset.locationLabelZhHans,
        asset.altTextEn,
        asset.altTextZhHans,
        asset.cameraMake,
        asset.cameraModel,
        asset.capturedAt
          ? new Date(asset.capturedAt).toISOString().slice(0, 10)
          : null,
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(query)),
    )
  }, [assets, search])
  const open = assets.find((asset) => asset.id === openId) ?? null
  const visibleTransfers = useMemo(
    () =>
      transfers.filter(
        (job) =>
          !queue.some((item) => item.uploadIntentId === job.uploadIntentId),
      ),
    [queue, transfers],
  )
  const transferCount = queue.length + visibleTransfers.length

  function patchQueue(id: string, patch: Partial<QueueItem>) {
    setQueue((current) =>
      current.map((item) => (item.id === id ? { ...item, ...patch } : item)),
    )
  }

  function scheduleQueueClear(id: string) {
    const timer = window.setTimeout(() => {
      setQueue((current) => current.filter((item) => item.id !== id))
    }, 2500)
    queueTimersRef.current.push(timer)
  }

  function mergeAsset(asset: MediaAssetReviewRecord | null, removedId?: string) {
    if (!asset) {
      if (removedId) {
        setActive((items) => items.filter((item) => item.id !== removedId))
        setArchived((items) => items.filter((item) => item.id !== removedId))
      }
      return
    }
    setActive((items) => {
      const without = items.filter((item) => item.id !== asset.id)
      return asset.catalogState === 'active' ? [asset, ...without] : without
    })
    setArchived((items) => {
      const without = items.filter((item) => item.id !== asset.id)
      return asset.catalogState === 'active' ? without : [asset, ...without]
    })
  }

  function offerArchiveUndo(assetId: string, operationId: string) {
    setArchiveUndo({ assetId, operationId })
    if (archiveUndoTimerRef.current !== null) {
      window.clearTimeout(archiveUndoTimerRef.current)
    }
    archiveUndoTimerRef.current = window.setTimeout(
      () => setArchiveUndo(null),
      10_000,
    )
  }

  async function undoArchive() {
    if (!archiveUndo) return
    const pendingUndo = archiveUndo
    setArchiveUndo(null)
    try {
      const response = await fetch(
        `/api/admin/media/assets/${pendingUndo.assetId}`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            intent: 'undo_archive',
            operationId: pendingUndo.operationId,
          }),
        },
      )
      const body = await adminResponseJson(response)
      mergeAsset(body.asset as MediaAssetReviewRecord)
      setView('active')
    } catch {
      await reloadAssets().catch(() => undefined)
    }
  }

  async function reloadAssets() {
    const [activeResponse, archivedResponse] = await Promise.all([
      fetch('/api/admin/media/assets?view=active', { cache: 'no-store' }),
      fetch('/api/admin/media/assets?view=archived', { cache: 'no-store' }),
    ])
    const [activeBody, archivedBody] = await Promise.all([
      adminResponseJson(activeResponse),
      adminResponseJson(archivedResponse),
    ])
    setActive(activeBody.assets as MediaAssetReviewRecord[])
    setArchived(archivedBody.assets as MediaAssetReviewRecord[])
  }

  async function reloadTransfers() {
    const response = await fetch('/api/admin/media/upload-intents', {
      cache: 'no-store',
    })
    const body = await adminResponseJson(response)
    if (!Array.isArray(body.transfers)) throw new Error('invalid_response')
    setTransfers(body.transfers as TransferJob[])
  }

  function setTransferNotice(uploadIntentId: string, notice: string | null) {
    setTransferNotices((current) => {
      const next = { ...current }
      if (notice === null) delete next[uploadIntentId]
      else next[uploadIntentId] = notice
      return next
    })
  }

  async function retryPersistedFile(job: TransferJob, file: File) {
    setPendingTransferId(job.uploadIntentId)
    setTransferNotice(job.uploadIntentId, null)
    const contentType = fileContentType(file)
    if (contentType !== job.contentType || file.size !== job.byteSize) {
      setTransferNotice(
        job.uploadIntentId,
        localize(
          locale,
          '请选择同一张原片（类型和大小必须一致）。',
          'Choose the same Original; its type and size must match.',
        ),
      )
      setPendingTransferId(null)
      return
    }
    try {
      const sha256 = await checksum(file)
      if (sha256 !== job.checksumSha256) {
        setTransferNotice(
          job.uploadIntentId,
          localize(
            locale,
            '这不是原来的文件，请重新选择。',
            'This is not the original file. Choose it again.',
          ),
        )
        return
      }
      const item: QueueItem = {
        id: crypto.randomUUID(),
        file,
        uploadIntentId: job.uploadIntentId,
        checksumSha256: sha256,
        status: 'uploading',
      }
      setQueue((current) => [item, ...current])
      void upload(item)
    } catch {
      setTransferNotice(
        job.uploadIntentId,
        localize(locale, '无法读取这个文件。', 'This file could not be read.'),
      )
    } finally {
      setPendingTransferId(null)
    }
  }

  async function retryPersistedProcessing(job: TransferJob) {
    if (!job.mediaAssetId) return
    setPendingTransferId(job.uploadIntentId)
    setTransferNotice(job.uploadIntentId, null)
    try {
      const response = await fetch(
        `/api/admin/media/assets/${job.mediaAssetId}/resume`,
        { method: 'POST' },
      )
      await adminResponseJson(response)
      await Promise.all([reloadAssets(), reloadTransfers()])
      setView('active')
    } catch {
      setTransferNotice(
        job.uploadIntentId,
        localize(
          locale,
          '暂时无法恢复处理，请稍后重试。',
          'Processing could not resume yet. Try again later.',
        ),
      )
      await reloadTransfers().catch(() => undefined)
    } finally {
      setPendingTransferId(null)
    }
  }

  async function discardTransfer() {
    if (!discardTarget) return
    const target = discardTarget
    cancelingTransferIdsRef.current.add(target.uploadIntentId)
    let discarded = false
    setPendingTransferId(target.uploadIntentId)
    setTransferNotice(target.uploadIntentId, null)
    try {
      const response = await fetch(
        `/api/admin/media/upload-intents/${target.uploadIntentId}`,
        { method: 'DELETE' },
      )
      await adminResponseJson(response)
      discarded = true
      setQueue((current) =>
        current.filter(
          (item) => item.uploadIntentId !== target.uploadIntentId,
        ),
      )
      setTransfers((current) =>
        current.filter(
          (job) => job.uploadIntentId !== target.uploadIntentId,
        ),
      )
      setDiscardTarget(null)
      await Promise.all([reloadAssets(), reloadTransfers()])
    } catch {
      setTransferNotice(
        target.uploadIntentId,
        localize(
          locale,
          '丢弃未完成。已确认的步骤会保留，可以安全重试。',
          'Discard is incomplete. Confirmed progress is saved and safe to retry.',
        ),
      )
      setDiscardTarget(null)
      await reloadTransfers().catch(() => undefined)
    } finally {
      if (!discarded) {
        cancelingTransferIdsRef.current.delete(target.uploadIntentId)
      }
      setPendingTransferId(null)
    }
  }

  async function upload(item: QueueItem) {
    const contentType = fileContentType(item.file)
    if (!contentType || item.file.size > MAX_ORIGINAL_UPLOAD_BYTES) {
      patchQueue(item.id, { status: 'failed', error: 'invalid_file' })
      return
    }
    try {
      let uploadIntentId = item.uploadIntentId
      let sha256 = item.checksumSha256
      let idempotencyKey = item.idempotencyKey
      if (!uploadIntentId) {
        patchQueue(item.id, { status: 'hashing' })
        sha256 ??= await checksum(item.file)
        idempotencyKey ??= durableUploadIdempotencyKey({
          checksumSha256: sha256,
          byteSize: item.file.size,
          contentType,
        })
        const intentResponse = await fetch('/api/admin/media/upload-intents', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            idempotencyKey,
            contentType,
            byteSize: item.file.size,
            checksumSha256: sha256,
          }),
        })
        const intentBody = await adminResponseJson(intentResponse)
        uploadIntentId = (intentBody.uploadIntent as { id: string }).id
        patchQueue(item.id, {
          checksumSha256: sha256,
          idempotencyKey,
          uploadIntentId,
          status: 'uploading',
        })
      }

      if (!sha256) {
        patchQueue(item.id, { status: 'hashing' })
        sha256 = await checksum(item.file)
        patchQueue(item.id, { checksumSha256: sha256 })
      }

      const chunkCount = originalUploadChunkCount(item.file.size)
      let uploadedChunkCount = item.uploadedChunkCount ?? 0
      let restartedAfterConflict = false
      let replacedMissingIntent = false
      while (uploadedChunkCount < chunkCount) {
        patchQueue(item.id, { status: 'uploading' })
        const start = uploadedChunkCount * MAX_ORIGINAL_UPLOAD_CHUNK_BYTES
        const chunk = item.file.slice(
          start,
          Math.min(start + MAX_ORIGINAL_UPLOAD_CHUNK_BYTES, item.file.size),
        )
        const chunkChecksumSha256 = await checksum(chunk)
        const uploadResponse = await uploadChunkWithRetry(
          `/api/admin/media/upload-intents/${uploadIntentId}/original?chunk=${uploadedChunkCount}`,
          {
            method: 'PUT',
            headers: {
              'content-type': 'application/octet-stream',
              'x-media-chunk-sha256': chunkChecksumSha256,
            },
            body: chunk,
          },
        )
        if (cancelingTransferIdsRef.current.has(uploadIntentId)) {
          throw new Error('upload_failed')
        }
        if (!uploadResponse.ok) {
          // Chunk responses use an empty 204 body on success, so they cannot
          // all flow through adminResponseJson. Failures still must use the
          // shared handler to re-enter Clerk after an expired session.
          if (uploadResponse.status === 401) {
            await adminResponseJson(uploadResponse)
          }
          if (uploadResponse.status === 404 && !replacedMissingIntent) {
            replacedMissingIntent = true
            // The stale reservation may still own partial chunks. Discard is
            // idempotent and closes the server-side transfer before a fresh
            // intent starts; a completed/ready replay simply rejects it.
            await fetch(
              `/api/admin/media/upload-intents/${uploadIntentId}`,
              { method: 'DELETE' },
            ).catch(() => undefined)
            clearDurableUploadIdempotencyKey({
              checksumSha256: sha256,
              byteSize: item.file.size,
              contentType,
            })
            idempotencyKey = durableUploadIdempotencyKey({
              checksumSha256: sha256,
              byteSize: item.file.size,
              contentType,
            })
            const replacementResponse = await fetch(
              '/api/admin/media/upload-intents',
              {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({
                  idempotencyKey,
                  contentType,
                  byteSize: item.file.size,
                  checksumSha256: sha256,
                }),
              },
            )
            const replacementBody = await adminResponseJson(replacementResponse)
            uploadIntentId = (
              replacementBody.uploadIntent as { id: string }
            ).id
            uploadedChunkCount = 0
            patchQueue(item.id, {
              idempotencyKey,
              uploadIntentId,
              uploadedChunkCount: 0,
            })
            continue
          }
          if (uploadResponse.status === 409 && !restartedAfterConflict) {
            restartedAfterConflict = true
            uploadedChunkCount = 0
            patchQueue(item.id, { uploadedChunkCount: 0 })
            continue
          }
          await adminResponseJson(uploadResponse)
          throw new Error('upload_failed')
        }
        uploadedChunkCount += 1
        patchQueue(item.id, { uploadedChunkCount })
      }

      patchQueue(item.id, { uploadIntentId, status: 'processing' })
      if (cancelingTransferIdsRef.current.has(uploadIntentId)) {
        throw new Error('upload_failed')
      }
      const completionResponse = await fetch(
        `/api/admin/media/upload-intents/${uploadIntentId}/complete`,
        { method: 'POST' },
      )
      let completionBody
      try {
        completionBody = await adminResponseJson(completionResponse)
      } catch (error) {
        if (error instanceof Error && error.message === 'original_mismatch') {
          patchQueue(item.id, { uploadedChunkCount: 0 })
        }
        throw error
      }
      const mediaAsset = completionBody.mediaAsset as {
        id: string
        processingState: string
      }
      patchQueue(item.id, { mediaAssetId: mediaAsset.id })
      if (mediaAsset.processingState !== 'ready') throw new Error('processing_failed')
      patchQueue(item.id, { status: 'ready' })
      scheduleQueueClear(item.id)
      clearDurableUploadIdempotencyKey({
        checksumSha256: sha256,
        byteSize: item.file.size,
        contentType,
      })
      try {
        setTransfers((current) =>
          current.filter((job) => job.uploadIntentId !== uploadIntentId),
        )
        await reloadAssets()
        setView('active')
      } catch {
        // The upload is complete even when the follow-up library refresh fails.
      }
      // The AI suggestion lands as approved bilingual Alt Text server-side,
      // so a fresh upload is publishable with no review step.
      try {
        const altTextResponse = await fetch(
          `/api/admin/media/assets/${mediaAsset.id}/alt-text`,
          { method: 'POST' },
        )
        const altTextBody = await adminResponseJson(altTextResponse)
        if (altTextBody.asset) {
          mergeAsset(altTextBody.asset as MediaAssetReviewRecord)
        }
      } catch {
        // Rate limits can exhaust mid-batch; the photo is safely archived
        // and its Alt Text can be filled from the inspector later.
      }
    } catch (error) {
      patchQueue(item.id, {
        status: 'failed',
        error: error instanceof Error ? error.message : 'request_failed',
      })
      await reloadTransfers().catch(() => undefined)
    }
  }

  function addFiles(files: File[]) {
    const additions = files.map(
      (file): QueueItem => ({
        id: crypto.randomUUID(),
        file,
        status: 'hashing',
      }),
    )
    setQueue((current) => [...additions, ...current])
    for (const item of additions) void upload(item)
  }

  return (
    <div className="pb-10">
      <div className="flex items-center justify-between gap-4">
        <h1 className="page-eyebrow">
          <T zh="媒体" en="Media" />
        </h1>
        <PixelCluster variant={8} className="shrink-0" />
      </div>
      <div className="mt-1 flex h-10 items-center justify-between gap-4">
        <p className="text-sm tabular-nums text-muted-foreground">
          {active.length} <T zh="张素材" en="in Library" />
          {archived.length > 0 && (
            <>
              {' · '}
              {archived.length} <T zh="张已归档" en="archived" />
            </>
          )}
        </p>
        <Button
          type="button"
          variant="primary"
          size="lg"
          expandHitArea
          active={transferOpen}
          onClick={() => setTransferOpen(true)}
        >
          <T zh="传输" en="Transfers" />
          {transferCount > 0 && (
            <span className="min-w-3 text-center tabular-nums">{transferCount}</span>
          )}
        </Button>
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <Tabs value={view} onValueChange={(value) => setView(value as LibraryView)}>
          <TabsList
            variant="subtle"
            aria-label={localize(locale, '媒体视图', 'Media view')}
          >
            <TabItem value="active" label={localize(locale, '素材库', 'Library')} />
            <TabItem
              value="archived"
              label={localize(locale, '已归档', 'Archived')}
            />
          </TabsList>
        </Tabs>
        <label className="relative min-w-0 flex-1 sm:max-w-56">
          <span className="sr-only">
            <T zh="搜索" en="Search" />
          </span>
          <Input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={localize(locale, '地点、日期、描述…', 'Place, date, alt text…')}
          />
        </label>
      </div>

      <div className="min-h-[25rem]">
        {visibleAssets.length === 0 ? (
          <p className="mt-6 hairline-top py-10 text-sm leading-6 text-muted-foreground">
          {assets.length === 0 ? (
            view === 'active' ? (
              <T
                zh="素材库还是空的——从传输开始。"
                en="The Library is empty — start a Transfer."
              />
            ) : (
              <T zh="没有已归档的素材。" en="Nothing is archived." />
            )
          ) : (
            <T zh="没有匹配的素材。" en="No matches." />
          )}
          </p>
        ) : (
          <ul className="mt-4 grid grid-cols-3 gap-2">
          {visibleAssets.map((asset) => {
            const tone = statusTone(asset)
            const inSelection = selectionIds.includes(asset.id)
            return (
              <li key={asset.id}>
                <button
                  type="button"
                  onClick={() => setOpenId(asset.id)}
                  aria-label={assetName(asset)}
                  aria-haspopup="dialog"
                  className="group photo-frame relative block aspect-square w-full overflow-hidden bg-surface-1 outline-none focus-visible:ring-1 focus-visible:ring-foreground focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                >
                  {asset.previewRendition ? (
                    // Bunny is the delivery and cache layer for Renditions.
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={asset.previewRendition.src}
                      alt=""
                      width={asset.previewRendition.width}
                      height={asset.previewRendition.height}
                      loading="lazy"
                      className="h-full w-full object-cover"
                      style={
                        asset.focalPoint
                          ? {
                              objectPosition: `${asset.focalPoint.x * 100}% ${asset.focalPoint.y * 100}%`,
                            }
                          : undefined
                      }
                    />
                  ) : (
                    <span className="flex h-full items-center justify-center px-2 text-center text-sm text-muted-foreground">
                      <T zh={processingLabel(asset).zh} en={processingLabel(asset).en} />
                    </span>
                  )}
                  {tone && (
                    <span
                      aria-hidden
                      className={`absolute right-1.5 top-1.5 h-2 w-2 rounded-full ring-2 ring-background ${
                        tone === 'busy' ? 'bg-amber-500' : 'bg-destructive'
                      }`}
                    />
                  )}
                  {inSelection && (
                    <span className="absolute bottom-1 left-1 rounded-sm bg-background/85 px-1.5 py-0.5 text-[11px] leading-4 text-foreground">
                      <T zh="选用" en="In use" />
                    </span>
                  )}
                  <span className="calibration-corners" aria-hidden />
                </button>
              </li>
            )
          })}
          </ul>
        )}

        {view === 'active' &&
          active.some((asset) => !isMediaAssetEligible(asset)) && (
            <p className="mt-4 text-sm leading-5 text-muted-foreground">
              <T
                zh="带黄点的素材还不能发布——处理中，或缺少替代文本（打开后保存即可）；红点表示需要打开检查一下。"
                en="Amber dots are not publishable yet — still processing, or missing Alt Text (open and save to fix); red dots want a look inside."
              />
            </p>
          )}
      </div>

      <Dialog
        open={open !== null}
        onOpenChange={(next) => {
          if (!next) setOpenId(null)
        }}
      >
        <DialogContent
          size="lg"
          className="h-[min(46rem,calc(100dvh-2rem))]"
        >
          <DialogBody>
            {open && (
              <Inspector
                key={open.id}
                asset={open}
                onArchiveUndo={(asset, operationId) => {
                  offerArchiveUndo(asset.id, operationId)
                }}
                onUpdated={(asset) => mergeAsset(asset, openId ?? undefined)}
                onClose={() => setOpenId(null)}
              />
            )}
          </DialogBody>
        </DialogContent>
      </Dialog>

      <TransferDialog
        open={transferOpen}
        onOpenChange={setTransferOpen}
        queue={queue}
        transfers={visibleTransfers}
        notices={transferNotices}
        pendingTransferId={pendingTransferId}
        discardTarget={discardTarget}
        onFiles={addFiles}
        onDismissQueueItem={(item) => {
          setQueue((current) =>
            current.filter((candidate) => candidate.id !== item.id),
          )
        }}
        onRetryQueueItem={(item) => void upload(item)}
        onChooseFile={(target, file) => void retryPersistedFile(target, file)}
        onRetryProcessing={(target) => void retryPersistedProcessing(target)}
        onRequestDiscard={setDiscardTarget}
        onCloseDiscard={() => setDiscardTarget(null)}
        onConfirmDiscard={() => void discardTransfer()}
      />

      {archiveUndo && (
        <div
          role="status"
          className="fixed bottom-24 left-1/2 z-[var(--z-toast)] flex min-h-11 w-[min(24rem,calc(100vw-2rem))] -translate-x-1/2 items-center justify-between gap-3 rounded-[2px] bg-foreground px-4 py-2 text-background shadow-[var(--shadow-medium)]"
        >
          <span className="text-sm">
            <T zh="已归档并从照片选集撤下。" en="Archived and withdrawn from Photo Selection." />
          </span>
          <Button type="button" variant="secondary" size="sm" onClick={() => void undoArchive()}>
            <T zh="撤销" en="Undo" />
          </Button>
        </div>
      )}
    </div>
  )
}
