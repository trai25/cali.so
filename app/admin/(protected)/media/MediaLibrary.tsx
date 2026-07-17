'use client'

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
  type KeyboardEvent,
  type MouseEvent,
} from 'react'

import {
  isReverificationResponse,
  PasskeyVerificationError,
  usePasskeyReverification,
} from '~/lib/admin/passkey-client'
import { T } from '~/lib/i18n'
import { localize, useLocale } from '~/lib/locale-client'
import type { MediaAssetReviewRecord } from '~/lib/media/asset-review/service'
import type { DraftPhotoSelection } from '~/lib/media/photo-selection/service'

import {
  isMediaAssetEligible,
  PhotoSelectionEditor,
  type PhotoSelectionEditorHandle,
} from '../photos/PhotoSelectionEditor'

type LibraryView = 'active' | 'archived'
type QueueStatus =
  | 'hashing'
  | 'uploading'
  | 'processing'
  | 'ready'
  | 'failed'

type QueueItem = {
  id: string
  file: File
  idempotencyKey?: string
  uploadIntentId?: string
  checksumSha256?: string
  originalUploaded?: boolean
  status: QueueStatus
  error?: string
}

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

async function checksum(file: File) {
  const bytes = await file.arrayBuffer()
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

async function responseJson(response: Response) {
  const body = (await response.json()) as Record<string, unknown>
  if (!response.ok) {
    throw new Error(typeof body.error === 'string' ? body.error : 'request_failed')
  }
  return body
}

function processingLabel(asset: MediaAssetReviewRecord) {
  if (asset.catalogState === 'purging') return { zh: '正在永久清除', en: 'Purging' }
  if (asset.catalogState === 'archived') return { zh: '已归档', en: 'Archived' }
  const labels = {
    upload_initiated: { zh: '等待上传', en: 'Upload initiated' },
    original_verified: { zh: '原片已验证', en: 'Original verified' },
    processing: { zh: '处理中', en: 'Processing' },
    ready: { zh: '可供审核', en: 'Ready for review' },
    retryable_failure: { zh: '可重试', en: 'Retry available' },
    repair_required: { zh: '需要处理', en: 'Repair required' },
  } as const
  return labels[asset.processingState]
}

function UploadQueue({
  items,
  onFiles,
  onRetry,
}: {
  items: QueueItem[]
  onFiles(files: File[]): void
  onRetry(item: QueueItem): void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)

  function drop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault()
    setDragging(false)
    onFiles(Array.from(event.dataTransfer.files))
  }

  return (
    <section
      id="upload"
      aria-labelledby="upload-heading"
      className="scroll-mt-6 pt-8"
    >
      <p className="text-sm font-medium tracking-[-0.011em] text-muted-foreground">
        <T zh="01 / 上传" en="01 / UPLOAD" />
      </p>
      <h2 id="upload-heading" className="mt-2 text-sm font-semibold">
        <T zh="添加照片" en="Add photos" />
      </h2>
      <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
        <T
          zh="选择照片后，每个文件会独立校验、上传和处理。完成的照片会直接出现在审核区。"
          en="Choose photos once. Each file is checked, uploaded, and processed independently, then appears directly in Review."
        />
      </p>
      <div
        onDragEnter={(event) => {
          event.preventDefault()
          setDragging(true)
        }}
        onDragOver={(event) => event.preventDefault()}
        onDragLeave={() => setDragging(false)}
        onDrop={drop}
        className={`mt-5 rounded-lg border border-dashed px-5 py-4 ${
          dragging ? 'border-foreground bg-surface-1' : 'border-border'
        }`}
      >
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-sm font-medium">
              <T
                zh="将 JPEG、PNG 或 HEIC 文件拖到这里"
                en="Drop JPEG, PNG, or HEIC files here"
              />
            </p>
            <p className="mt-1 text-sm leading-5 text-muted-foreground">
              <T
                zh="每个文件最大 50 MiB。每个文件会独立上传、处理和重试。"
                en="Up to 50 MiB each. Every file uploads, processes, and retries independently."
              />
            </p>
          </div>
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="min-h-11 rounded-md bg-foreground px-4 text-sm font-medium text-background outline-none active:scale-[0.98] focus-visible:ring-1 focus-visible:ring-foreground focus-visible:ring-offset-2"
          >
            <T zh="选择文件" en="Choose files" />
          </button>
          <input
            ref={inputRef}
            type="file"
            multiple
            accept=".heic,.heif,.jpg,.jpeg,.png,image/heic,image/heif,image/jpeg,image/png"
            className="sr-only"
            onChange={(event: ChangeEvent<HTMLInputElement>) => {
              onFiles(Array.from(event.target.files ?? []))
              event.target.value = ''
            }}
          />
        </div>

        {items.length > 0 && (
          <ol
            aria-live="polite"
            className="mt-5 divide-y divide-border/70 border-t border-dotted border-border"
          >
            {items.map((item) => (
              <li
                key={item.id}
                className="flex min-h-14 items-center justify-between gap-4 py-2 text-sm"
              >
                <div className="min-w-0">
                  <p className="truncate font-medium">{item.file.name}</p>
                  <p className="mt-0.5 text-sm text-muted-foreground">
                    {item.status === 'hashing' && <T zh="正在校验" en="Checking" />}
                    {item.status === 'uploading' && <T zh="正在上传" en="Uploading" />}
                    {item.status === 'processing' && <T zh="正在处理" en="Processing" />}
                    {item.status === 'ready' && <T zh="可供审核" en="Ready for review" />}
                    {item.status === 'failed' && (
                      <T zh="失败，可以单独重试" en="Failed, ready to retry" />
                    )}
                  </p>
                </div>
                {item.status === 'failed' ? (
                  <button
                    type="button"
                    onClick={() => onRetry(item)}
                    className="min-h-11 px-3 text-sm font-medium outline-none focus-visible:rounded-sm focus-visible:ring-1 focus-visible:ring-foreground"
                  >
                    <T zh="重试" en="Retry" />
                  </button>
                ) : (
                  <span className="text-sm tabular-nums text-muted-foreground">
                    {(item.file.size / 1024 / 1024).toFixed(1)} MiB
                  </span>
                )}
              </li>
            ))}
          </ol>
        )}
      </div>
    </section>
  )
}

function AssetGrid({
  assets,
  draftIds,
  selectedId,
  onAddToDraft,
  onSelect,
}: {
  assets: MediaAssetReviewRecord[]
  draftIds: string[]
  selectedId: string | null
  onAddToDraft(id: string): void
  onSelect(id: string): void
}) {
  if (assets.length === 0) {
    return (
      <p className="border-t border-dashed border-border py-10 text-sm leading-6 text-muted-foreground">
        <T
          zh="这个视图还没有媒体素材。"
          en="There are no Media Assets in this view yet."
        />
      </p>
    )
  }

  return (
    <ul className="grid grid-cols-2 gap-x-4 gap-y-7 sm:grid-cols-3 xl:grid-cols-4">
      {assets.map((asset) => {
        const status = processingLabel(asset)
        const inDraft = draftIds.includes(asset.id)
        const eligible = isMediaAssetEligible(asset)
        return (
          <li key={asset.id} className="min-w-0">
            <button
              type="button"
              onClick={() => onSelect(asset.id)}
              aria-pressed={selectedId === asset.id}
              className="group w-full text-left outline-none"
            >
              <span
                className={`relative flex aspect-[4/3] items-center justify-center overflow-hidden rounded-md bg-surface-1 ring-offset-2 ring-offset-background ${
                  selectedId === asset.id
                    ? 'ring-1 ring-foreground'
                    : 'group-focus-visible:ring-1 group-focus-visible:ring-foreground'
                }`}
              >
                {asset.previewRendition ? (
                  // Bunny is the delivery and cache layer for Renditions.
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={asset.previewRendition.src}
                    alt=""
                    width={asset.previewRendition.width}
                    height={asset.previewRendition.height}
                    className="h-full w-full object-contain"
                  />
                ) : (
                  <span className="text-sm text-muted-foreground">
                    <T zh="尚无成品" en="No Rendition yet" />
                  </span>
                )}
              </span>
              <span className="mt-2 block truncate text-sm font-medium">
                {asset.locationLabelEn || asset.locationLabelZhHans || asset.id.slice(0, 8)}
              </span>
              <span className="mt-1 flex flex-wrap gap-x-2 gap-y-0.5 text-sm text-muted-foreground">
                <T zh={status.zh} en={status.en} />
                <span aria-hidden="true">·</span>
                <span>
                  {eligible ? (
                    <T zh="可发布" en="Ready to publish" />
                  ) : (
                    <T zh="需要审核" en="Review needed" />
                  )}
                </span>
              </span>
            </button>
            {asset.catalogState === 'active' && (
              <div className="mt-2 min-h-11 border-t border-dotted border-border pt-1">
                {inDraft ? (
                  <a
                    href="#publish"
                    className="inline-flex min-h-11 items-center text-sm font-medium text-foreground outline-none focus-visible:rounded-sm focus-visible:ring-1 focus-visible:ring-foreground"
                  >
                    <T zh="已在草稿中" en="In Draft" />
                  </a>
                ) : eligible ? (
                  <button
                    type="button"
                    onClick={() => onAddToDraft(asset.id)}
                    className="min-h-11 text-sm font-medium text-foreground outline-none active:scale-[0.97] focus-visible:rounded-sm focus-visible:ring-1 focus-visible:ring-foreground motion-reduce:transform-none"
                  >
                    <T zh="添加到草稿" en="Add to Draft" />
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => onSelect(asset.id)}
                    className="min-h-11 text-sm text-muted-foreground outline-none focus-visible:rounded-sm focus-visible:ring-1 focus-visible:ring-foreground"
                  >
                    <T zh="完成审核以发布" en="Finish review to publish" />
                  </button>
                )}
              </div>
            )}
          </li>
        )
      })}
    </ul>
  )
}

function Field({
  label,
  value,
  onChange,
}: {
  label: React.ReactNode
  value: string
  onChange(value: string): void
}) {
  return (
    <label className="grid gap-1.5 text-sm text-muted-foreground">
      {label}
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="min-h-11 rounded-md border border-border bg-background px-3 text-base text-foreground outline-none focus:border-foreground"
      />
    </label>
  )
}

function Inspector({
  asset,
  onUpdated,
}: {
  asset: MediaAssetReviewRecord
  onUpdated(asset: MediaAssetReviewRecord | null): void
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
  const [suggestion, setSuggestion] = useState(asset.altTextSuggestion)
  const [focalPoint, setFocalPoint] = useState(asset.focalPoint)
  const [pending, setPending] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const noticeRef = useRef<HTMLParagraphElement>(null)
  const purgeAsset = usePasskeyReverification(async (confirmation: string) => {
    const response = await fetch(`/api/admin/media/assets/${asset.id}/purge`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ confirmation }),
    })
    if (await isReverificationResponse(response)) return response
    return responseJson(response)
  })

  useEffect(() => {
    if (notice) noticeRef.current?.focus()
  }, [notice])

  async function mutate(body: Record<string, unknown>) {
    const response = await fetch(`/api/admin/media/assets/${asset.id}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })
    return responseJson(response)
  }

  async function saveMetadata() {
    setPending('metadata')
    setNotice(null)
    try {
      const body = await mutate({
        intent: 'update_display_metadata',
        locationLabelZhHans: locationZh.trim() || null,
        locationLabelEn: locationEn.trim() || null,
        focalPoint,
      })
      onUpdated(body.asset as MediaAssetReviewRecord)
      setNotice(localize(locale, '显示元数据已保存。', 'Display Metadata saved.'))
    } catch {
      setNotice(localize(locale, '无法保存，请重试。', 'Could not save. Try again.'))
    } finally {
      setPending(null)
    }
  }

  async function approveAltText() {
    setPending('alt')
    setNotice(null)
    try {
      const body = await mutate({
        intent: 'approve_alt_text',
        zhHans: altZh.trim(),
        en: altEn.trim(),
      })
      onUpdated(body.asset as MediaAssetReviewRecord)
      setNotice(localize(locale, '替代文本已审核。', 'Alt Text approved.'))
    } catch {
      setNotice(
        localize(locale, '两种语言都需要有效文本。', 'Both languages need valid text.'),
      )
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
      const body = await responseJson(response)
      const nextSuggestion = body.suggestion as {
        zhHans: string
        en: string
        model: string
        suggestedAt: string | Date
      }
      setSuggestion({
        ...nextSuggestion,
        suggestedAt: new Date(nextSuggestion.suggestedAt),
      })
      setAltZh(nextSuggestion.zhHans)
      setAltEn(nextSuggestion.en)
      setNotice(localize(locale, '已生成新的建议。', 'New suggestion generated.'))
    } catch {
      setNotice(
        localize(locale, '暂时无法生成建议，素材仍然安全。', 'Suggestion unavailable. The Media Asset is safe.'),
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
      const body = await responseJson(response)
      const nextSuggestion = body.suggestion as {
        zhHans?: string
        en?: string
      }
      if (nextSuggestion.zhHans) setLocationZh(nextSuggestion.zhHans)
      if (nextSuggestion.en) setLocationEn(nextSuggestion.en)
      setNotice(
        localize(
          locale,
          '已根据私密拍摄位置填写建议，请审核后保存。',
          'Suggested from the private Capture Location. Review before saving.',
        ),
      )
    } catch (error) {
      const code = error instanceof Error ? error.message : ''
      setNotice(
        code === 'no_capture_location'
          ? localize(
              locale,
              '这个文件没有 GPS 拍摄位置。请手动填写地点标签。',
              'This file has no GPS Capture Location. Enter the Location Label manually.',
            )
          : code === 'no_results'
            ? localize(
                locale,
                '找不到这个拍摄位置的地点名称。请手动填写地点标签。',
                'No place name was found for this Capture Location. Enter the label manually.',
              )
            : localize(
                locale,
                '暂时无法查询地点名称。请重试，或手动填写地点标签。',
                'The place name could not be looked up. Retry or enter the label manually.',
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
      const response = await fetch(
        `/api/admin/media/assets/${asset.id}/resume`,
        { method: 'POST' },
      )
      const body = await responseJson(response)
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
    if (
      intent === 'archive' &&
      !globalThis.confirm(
        localize(
          locale,
          '归档这个媒体素材？它会从普通视图和新的照片选择中隐藏。',
          'Archive this Media Asset? It will be hidden from normal views and new Photo Selections.',
        ),
      )
    ) {
      return
    }
    setPending(intent)
    setNotice(null)
    try {
      const body = await mutate({ intent })
      onUpdated(body.asset as MediaAssetReviewRecord)
    } catch {
      setNotice(
        localize(
          locale,
          '这个素材仍在照片选择中，或暂时无法更新。',
          'This asset is still in a Photo Selection or could not be updated.',
        ),
      )
    } finally {
      setPending(null)
    }
  }

  async function purge() {
    const confirmation = globalThis.prompt(
      localize(
        locale,
        '永久清除不可撤销。输入 PURGE 以清除原片、成品和目录记录。',
        'Purge cannot be undone. Type PURGE to purge the Original, Renditions, and catalog record.',
      ),
    )
    if (confirmation !== 'PURGE') return
    setPending('purge')
    setNotice(null)
    try {
      await purgeAsset(confirmation)
      onUpdated(null)
    } catch (error) {
      setNotice(
        error instanceof PasskeyVerificationError
          ? localize(
              locale,
              '未能确认通行密钥验证，没有清除任何内容。请重试。',
              'Passkey verification could not be confirmed. Nothing was purged. Try again.',
            )
          : localize(
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
  const camera = [
    captured,
    [asset.cameraMake, asset.cameraModel].filter(Boolean).join(' ') || null,
    asset.lens,
    asset.focalLengthMillimeters
      ? `${asset.focalLengthMillimeters} mm`
      : null,
    asset.aperture ? `ƒ/${asset.aperture}` : null,
    asset.shutterSpeedSeconds
      ? asset.shutterSpeedSeconds < 1
        ? `1/${Math.round(1 / asset.shutterSpeedSeconds)}`
        : `${asset.shutterSpeedSeconds}s`
      : null,
    asset.iso ? `ISO ${asset.iso}` : null,
  ].filter(Boolean)

  return (
    <aside className="min-w-0 border-t border-dashed border-border pt-6 xl:border-l xl:border-t-0 xl:pl-7 xl:pt-0">
      <p className="text-sm font-medium tracking-[-0.011em] text-muted-foreground">
        <T zh="审核" en="REVIEW" />
      </p>
      <h2 className="mt-2 break-words text-sm font-semibold">
        {asset.locationLabelEn || asset.locationLabelZhHans || asset.id.slice(0, 8)}
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">
        <T
          zh={processingLabel(asset).zh}
          en={processingLabel(asset).en}
        />
      </p>

      {/* Ingestion claims processing with a compare-and-set. An active worker
          wins; Resume only takes over a processing claim after it is stale. */}
      {['original_verified', 'processing', 'retryable_failure'].includes(
        asset.processingState,
      ) && (
        <button
          type="button"
          disabled={pending !== null || asset.catalogState !== 'active'}
          onClick={resumeProcessing}
          className="mt-4 min-h-11 rounded-md border border-border px-4 text-sm font-medium outline-none disabled:opacity-50 focus-visible:border-foreground"
        >
          {pending === 'resume' ? (
            <T zh="正在恢复…" en="Resuming…" />
          ) : (
            <T zh="恢复处理" en="Resume processing" />
          )}
        </button>
      )}

      {asset.previewRendition && (
        <button
          type="button"
          disabled={asset.catalogState !== 'active'}
          onClick={chooseFocalPoint}
          onKeyDown={moveFocalPoint}
          aria-label={localize(locale, '设置焦点', 'Set Focal Point')}
          className="relative mt-5 block w-full overflow-hidden rounded-md bg-surface-1 outline-none disabled:cursor-not-allowed disabled:opacity-70 focus-visible:ring-1 focus-visible:ring-foreground"
        >
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
              style={{ left: `${focalPoint.x * 100}%`, top: `${focalPoint.y * 100}%` }}
            />
          )}
        </button>
      )}
      <p className="mt-2 text-sm leading-5 text-muted-foreground">
        <T
          zh="点击图像设置裁切焦点；键盘可使用方向键微调。"
          en="Click the image to set its Focal Point, or use the arrow keys to adjust it."
        />
      </p>

      {camera.length > 0 && (
        <p className="mt-4 text-sm leading-5 text-muted-foreground">
          {camera.join(' · ')}
        </p>
      )}

      <div className="mt-6 grid gap-4 border-t border-dotted border-border pt-5">
        <div className="flex flex-col items-start gap-2 sm:flex-row sm:justify-between">
          <div>
            <h3 className="text-sm font-medium">
              <T zh="地点标签" en="Location Label" />
            </h3>
            <p className="mt-1 text-sm leading-5 text-muted-foreground">
              {asset.hasCaptureLocation ? (
                <T
                  zh="有私密拍摄位置，可安全查询地点名称。"
                  en="Private Capture Location available for a place-name lookup."
                />
              ) : (
                <T
                  zh="这个文件没有 GPS 拍摄位置，请手动填写。"
                  en="This file has no GPS Capture Location. Enter the label manually."
                />
              )}
            </p>
          </div>
          <button
            type="button"
            disabled={
              pending !== null ||
              asset.catalogState !== 'active' ||
              !asset.hasCaptureLocation
            }
            onClick={suggestLocationLabel}
            className="min-h-11 shrink-0 px-2 text-sm font-medium text-muted-foreground outline-none disabled:cursor-not-allowed disabled:opacity-50 focus-visible:rounded-sm focus-visible:ring-1 focus-visible:ring-foreground"
          >
            {pending === 'location' ? (
              <T zh="正在查询…" en="Suggesting…" />
            ) : (
              <T zh="根据拍摄位置建议" en="Suggest from Capture Location" />
            )}
          </button>
        </div>
        <Field
          label={<T zh="地点标签（英文）" en="Location Label (English)" />}
          value={locationEn}
          onChange={setLocationEn}
        />
        <Field
          label={<T zh="地点标签（中文）" en="Location Label (Chinese)" />}
          value={locationZh}
          onChange={setLocationZh}
        />
        <button
          type="button"
          disabled={pending !== null || asset.catalogState !== 'active'}
          onClick={saveMetadata}
          className="min-h-11 rounded-md border border-border px-4 text-sm font-medium outline-none disabled:opacity-50 focus-visible:border-foreground"
        >
          {pending === 'metadata' ? <T zh="正在保存…" en="Saving…" /> : <T zh="保存显示元数据" en="Save Display Metadata" />}
        </button>
      </div>

      <section className="mt-7 border-t border-dashed border-border pt-5">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-sm font-medium">
            <T zh="替代文本建议" en="Alt Text Suggestion" />
          </h3>
          <button
            type="button"
            disabled={pending !== null || asset.catalogState !== 'active'}
            onClick={regenerate}
            className="min-h-11 px-2 text-sm font-medium text-muted-foreground outline-none disabled:opacity-50 focus-visible:rounded-sm focus-visible:ring-1 focus-visible:ring-foreground"
          >
            {pending === 'suggestion' ? <T zh="生成中…" en="Generating…" /> : <T zh="重新生成" en="Regenerate" />}
          </button>
        </div>
        {suggestion && (
          <div className="mt-3 rounded-md bg-surface-1 px-3 py-3 text-sm leading-5 text-muted-foreground">
            <p>{suggestion.en}</p>
            <p className="mt-2">{suggestion.zhHans}</p>
          </div>
        )}
        <div className="mt-4 grid gap-4">
          <Field
            label={<T zh="替代文本（英文）" en="Alt Text (English)" />}
            value={altEn}
            onChange={setAltEn}
          />
          <Field
            label={<T zh="替代文本（中文）" en="Alt Text (Chinese)" />}
            value={altZh}
            onChange={setAltZh}
          />
          <button
            type="button"
            disabled={pending !== null || asset.catalogState !== 'active'}
            onClick={approveAltText}
            className="min-h-11 rounded-md bg-foreground px-4 text-sm font-medium text-background outline-none disabled:opacity-50 focus-visible:ring-1 focus-visible:ring-foreground focus-visible:ring-offset-2"
          >
            {pending === 'alt' ? <T zh="正在审核…" en="Approving…" /> : <T zh="审核替代文本" en="Approve Alt Text" />}
          </button>
        </div>
      </section>

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

      <div className="mt-7 flex flex-wrap gap-2 border-t border-dashed border-border pt-5">
        {asset.catalogState === 'active' ? (
          <button
            type="button"
            disabled={pending !== null}
            onClick={() => changeCatalogState('archive')}
            className="min-h-11 px-3 text-sm text-muted-foreground outline-none disabled:opacity-50 focus-visible:rounded-sm focus-visible:ring-1 focus-visible:ring-foreground"
          >
            <T zh="归档" en="Archive" />
          </button>
        ) : asset.catalogState === 'archived' ? (
          <>
            <button
              type="button"
              disabled={pending !== null}
              onClick={() => changeCatalogState('restore')}
              className="min-h-11 rounded-md border border-border px-4 text-sm font-medium outline-none disabled:opacity-50 focus-visible:border-foreground"
            >
              <T zh="恢复" en="Restore" />
            </button>
            <button
              type="button"
              disabled={pending !== null}
              onClick={purge}
              className="min-h-11 px-3 text-sm text-destructive outline-none disabled:opacity-50 focus-visible:rounded-sm focus-visible:ring-1 focus-visible:ring-destructive"
            >
              <T zh="永久清除" en="Purge permanently" />
            </button>
          </>
        ) : (
          <button
            type="button"
            disabled={pending !== null}
            onClick={purge}
            className="min-h-11 px-3 text-sm text-destructive outline-none disabled:opacity-50 focus-visible:rounded-sm focus-visible:ring-1 focus-visible:ring-destructive"
          >
            <T zh="重试清除" en="Retry Purge" />
          </button>
        )}
      </div>
      {asset.catalogState !== 'active' && (
        <p className="mt-3 text-sm leading-5 text-muted-foreground">
          <T
            zh="归档不会撤销已经知道的成品 URL；只有永久清除完成后才会删除文件和 CDN 缓存。"
            en="Archive does not revoke a known Rendition URL. Files and CDN cache are removed only after Purge completes."
          />
        </p>
      )}
    </aside>
  )
}

export function MediaLibrary({
  initialActive,
  initialArchived,
  initialDraft,
}: {
  initialActive: MediaAssetReviewRecord[]
  initialArchived: MediaAssetReviewRecord[]
  initialDraft: DraftPhotoSelection
}) {
  const locale = useLocale()
  const [active, setActive] = useState(initialActive)
  const [archived, setArchived] = useState(initialArchived)
  const [view, setView] = useState<LibraryView>('active')
  const [selectedId, setSelectedId] = useState<string | null>(
    initialActive[0]?.id ?? null,
  )
  const [queue, setQueue] = useState<QueueItem[]>([])
  const [search, setSearch] = useState('')
  const [draftIds, setDraftIds] = useState(initialDraft.mediaAssetIds)
  const photoSelectionRef = useRef<PhotoSelectionEditorHandle>(null)

  const assets = view === 'active' ? active : archived
  const visibleAssets = useMemo(() => {
    const query = search.trim().toLowerCase()
    if (!query) return assets
    return assets.filter((asset) =>
      [asset.id, asset.locationLabelEn, asset.locationLabelZhHans]
        .filter(Boolean)
        .some((value) => value!.toLowerCase().includes(query)),
    )
  }, [assets, search])
  const selected = assets.find((asset) => asset.id === selectedId) ?? null

  function patchQueue(id: string, patch: Partial<QueueItem>) {
    setQueue((current) =>
      current.map((item) => (item.id === id ? { ...item, ...patch } : item)),
    )
  }

  async function reloadAssets() {
    const [activeResponse, archivedResponse] = await Promise.all([
      fetch('/api/admin/media/assets?view=active', { cache: 'no-store' }),
      fetch('/api/admin/media/assets?view=archived', { cache: 'no-store' }),
    ])
    const [activeBody, archivedBody] = await Promise.all([
      responseJson(activeResponse),
      responseJson(archivedResponse),
    ])
    setActive(activeBody.assets as MediaAssetReviewRecord[])
    setArchived(archivedBody.assets as MediaAssetReviewRecord[])
  }

  async function upload(item: QueueItem) {
    const contentType = fileContentType(item.file)
    if (!contentType || item.file.size > 50 * 1024 * 1024) {
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
        const intentBody = await responseJson(intentResponse)
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

      if (!item.originalUploaded) {
        patchQueue(item.id, { status: 'uploading' })
        const uploadResponse = await fetch(
          `/api/admin/media/upload-intents/${uploadIntentId}/original`,
          {
            method: 'PUT',
            headers: {
              'content-type': contentType,
              'x-media-checksum-sha256': sha256,
            },
            body: item.file,
          },
        )
        if (!uploadResponse.ok) throw new Error('upload_failed')
        patchQueue(item.id, { originalUploaded: true })
      }

      patchQueue(item.id, { uploadIntentId, status: 'processing' })
      const completionResponse = await fetch(
        `/api/admin/media/upload-intents/${uploadIntentId}/complete`,
        { method: 'POST' },
      )
      const completionBody = await responseJson(completionResponse)
      const mediaAsset = completionBody.mediaAsset as {
        id: string
        processingState: string
      }
      if (mediaAsset.processingState !== 'ready') throw new Error('processing_failed')
      patchQueue(item.id, { status: 'ready' })
      clearDurableUploadIdempotencyKey({
        checksumSha256: sha256,
        byteSize: item.file.size,
        contentType,
      })
      await fetch(`/api/admin/media/assets/${mediaAsset.id}/alt-text`, {
        method: 'POST',
      }).catch(() => null)
      try {
        await reloadAssets()
        setView('active')
        setSelectedId(mediaAsset.id)
      } catch {
        // The upload is complete even when the follow-up library refresh fails.
      }
    } catch (error) {
      patchQueue(item.id, {
        status: 'failed',
        error: error instanceof Error ? error.message : 'request_failed',
      })
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

  function updatedAsset(asset: MediaAssetReviewRecord | null) {
    if (!asset) {
      setActive((items) => items.filter((item) => item.id !== selectedId))
      setArchived((items) => items.filter((item) => item.id !== selectedId))
      setSelectedId(null)
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
    if (asset.catalogState === 'active' && view === 'archived') setSelectedId(null)
    if (asset.catalogState !== 'active' && view === 'active') setSelectedId(null)
  }

  function chooseView(next: LibraryView) {
    setView(next)
    setSelectedId((next === 'active' ? active : archived)[0]?.id ?? null)
  }

  return (
    <div>
      <div className="border-b border-dashed border-border pb-6">
        <p className="text-sm font-medium tracking-[-0.011em] text-muted-foreground">
          <T zh="媒体工作区" en="MEDIA WORKSPACE" />
        </p>
        <h1 className="mt-2 text-sm font-semibold">
          <T
            zh="从上传到发布，一处完成"
            en="From upload to publish, in one place"
          />
        </h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
          <T
            zh="上传照片、完成地点与替代文本审核、加入草稿，然后发布。每个素材都会显示下一步。"
            en="Upload photos, finish Location and Alt Text review, add them to the Draft, then publish. Every asset shows its next action."
          />
        </p>
      </div>

      <nav
        aria-label="Media workflow"
        className="sticky top-0 isolate mt-4 grid grid-cols-3 gap-1 border-y border-dashed border-border bg-background py-2 sm:grid-cols-[repeat(3,minmax(0,1fr))_auto]"
      >
        {[
          { href: '#upload', zh: '01 上传', en: '01 Upload' },
          { href: '#review', zh: '02 审核', en: '02 Review' },
          { href: '#publish', zh: '03 发布', en: '03 Publish' },
        ].map((stage) => (
          <a
            key={stage.href}
            href={stage.href}
            className="inline-flex min-h-11 items-center justify-center rounded-md px-3 text-sm text-muted-foreground outline-none hover:bg-hover hover:text-foreground focus-visible:ring-1 focus-visible:ring-foreground sm:justify-start"
          >
            <T zh={stage.zh} en={stage.en} />
          </a>
        ))}
        <a
          href="#publish"
          className="col-span-3 inline-flex min-h-11 items-center justify-between rounded-md bg-surface-1 px-3 text-sm font-medium outline-none focus-visible:ring-1 focus-visible:ring-foreground sm:col-span-1 sm:min-w-36"
        >
          <T zh="草稿" en="Draft" />
          <span className="tabular-nums">{draftIds.length}</span>
        </a>
      </nav>

      <UploadQueue
        items={queue}
        onFiles={addFiles}
        onRetry={(item) => void upload(item)}
      />

      <section id="review" className="scroll-mt-6 pt-10">
        <p className="text-sm font-medium tracking-[-0.011em] text-muted-foreground">
          <T zh="02 / 审核" en="02 / REVIEW" />
        </p>
        <div className="mt-2 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 className="text-sm font-semibold">
              <T zh="准备照片" en="Prepare photos" />
            </h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
              <T
                zh="选择素材，完成地点、焦点和替代文本。准备完成后可直接加入草稿。"
                en="Select an asset, finish its location, focal point, and Alt Text, then add it directly to the Draft."
              />
            </p>
          </div>
        </div>

        <div className="mt-6 flex flex-wrap items-center justify-between gap-4 border-t border-dashed border-border pt-5">
          <div
            className="flex items-center gap-1"
            role="tablist"
            aria-label="Media Asset view"
          >
            {(['active', 'archived'] as const).map((item) => (
              <button
                key={item}
                type="button"
                role="tab"
                aria-selected={view === item}
                onClick={() => chooseView(item)}
                className={`min-h-11 rounded-md px-3 text-sm outline-none focus-visible:ring-1 focus-visible:ring-foreground ${
                  view === item
                    ? 'bg-foreground text-background'
                    : 'text-muted-foreground hover:bg-hover hover:text-foreground'
                }`}
              >
                {item === 'active' ? (
                  <T
                    zh={`使用中 ${active.length}`}
                    en={`Active ${active.length}`}
                  />
                ) : (
                  <T
                    zh={`已归档 ${archived.length}`}
                    en={`Archived ${archived.length}`}
                  />
                )}
              </button>
            ))}
          </div>
          <label className="relative w-full max-w-xs">
            <span className="sr-only">
              <T zh="搜索媒体素材" en="Search Media Assets" />
            </span>
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={localize(
                locale,
                '搜索媒体素材',
                'Search Media Assets',
              )}
              className="min-h-11 w-full rounded-md border border-border bg-background px-3 text-base outline-none placeholder:text-muted-foreground focus:border-foreground"
            />
          </label>
        </div>

        <div className="mt-7 grid min-w-0 gap-8 xl:grid-cols-[minmax(0,1fr)_minmax(24rem,0.8fr)]">
          <AssetGrid
            assets={visibleAssets}
            draftIds={draftIds}
            selectedId={selectedId}
            onAddToDraft={(mediaAssetId) =>
              photoSelectionRef.current?.addToDraft(mediaAssetId)
            }
            onSelect={setSelectedId}
          />
          {selected ? (
            <Inspector
              key={selected.id}
              asset={selected}
              onUpdated={updatedAsset}
            />
          ) : (
            <aside className="border-t border-dashed border-border pt-6 text-sm leading-6 text-muted-foreground xl:border-l xl:border-t-0 xl:pl-7 xl:pt-0">
              <T
                zh="选择一个媒体素材以审核显示元数据、焦点和替代文本。"
                en="Select a Media Asset to review Display Metadata, Focal Point, and Alt Text."
              />
            </aside>
          )}
        </div>
      </section>

      <div className="mt-12">
        <PhotoSelectionEditor
          ref={photoSelectionRef}
          initialDraft={initialDraft}
          initialAssets={active}
          onDraftChange={setDraftIds}
        />
      </div>
    </div>
  )
}
