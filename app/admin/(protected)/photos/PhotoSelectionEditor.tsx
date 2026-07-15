'use client'

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent,
} from 'react'

import { T } from '~/lib/i18n'
import { localize, useLocale } from '~/lib/locale-client'
import type { MediaAssetReviewRecord } from '~/lib/media/asset-review/service'
import type { DraftPhotoSelection } from '~/lib/media/photo-selection/service'

type SaveState = 'idle' | 'saving' | 'saved' | 'error'

async function responseJson(response: Response) {
  const body = (await response.json()) as Record<string, unknown>
  if (!response.ok) {
    throw new Error(typeof body.error === 'string' ? body.error : 'request_failed')
  }
  return body
}

function eligible(asset: MediaAssetReviewRecord) {
  return (
    asset.lifecycle === 'active' &&
    asset.processingState === 'ready' &&
    asset.previewRendition !== null &&
    asset.altTextApprovedAt !== null &&
    Boolean(asset.altTextZhHans?.trim()) &&
    Boolean(asset.altTextEn?.trim())
  )
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

function PreviewImage({
  asset,
  cropped = false,
}: {
  asset: MediaAssetReviewRecord
  cropped?: boolean
}) {
  if (!asset.previewRendition) {
    return (
      <span className="flex h-full items-center justify-center text-sm text-muted-foreground">
        <T zh="成品不可用" en="Rendition unavailable" />
      </span>
    )
  }
  const focalPoint = asset.focalPoint ?? { x: 0.5, y: 0.5 }
  return (
    // Bunny is the delivery and cache layer for Renditions.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={asset.previewRendition.src}
      alt={asset.altTextEn || asset.altTextZhHans || ''}
      width={asset.previewRendition.width}
      height={asset.previewRendition.height}
      className={cropped ? 'h-full w-full object-cover' : 'h-full w-full object-contain'}
      style={
        cropped
          ? { objectPosition: `${focalPoint.x * 100}% ${focalPoint.y * 100}%` }
          : undefined
      }
    />
  )
}

export function PhotoSelectionEditor({
  initialDraft,
  initialAssets,
}: {
  initialDraft: DraftPhotoSelection
  initialAssets: MediaAssetReviewRecord[]
}) {
  const locale = useLocale()
  const [mediaAssetIds, setMediaAssetIds] = useState(initialDraft.mediaAssetIds)
  const [revision, setRevision] = useState(initialDraft.revision)
  const [saveState, setSaveState] = useState<SaveState>('idle')
  const [notice, setNotice] = useState<string | null>(null)
  const [publishing, setPublishing] = useState(false)
  const [draggedId, setDraggedId] = useState<string | null>(null)
  const noticeRef = useRef<HTMLParagraphElement>(null)
  const publishKeyRef = useRef<string | null>(null)

  const assetById = useMemo(
    () => new Map(initialAssets.map((asset) => [asset.id, asset])),
    [initialAssets],
  )
  const availableAssets = initialAssets.filter(
    (asset) => eligible(asset) && !mediaAssetIds.includes(asset.id),
  )
  const invalidIds = mediaAssetIds.filter((id) => {
    const asset = assetById.get(id)
    return !asset || !eligible(asset)
  })

  useEffect(() => {
    if (notice) noticeRef.current?.focus()
  }, [notice])

  async function save(nextIds: string[]) {
    if (saveState === 'saving' || publishing) return
    const previousIds = mediaAssetIds
    setMediaAssetIds(nextIds)
    setSaveState('saving')
    setNotice(null)
    try {
      const response = await fetch('/api/admin/media/photo-selection', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ expectedRevision: revision, mediaAssetIds: nextIds }),
      })
      const body = await responseJson(response)
      const draft = body.draft as DraftPhotoSelection
      setRevision(draft.revision)
      setMediaAssetIds(draft.mediaAssetIds)
      publishKeyRef.current = null
      setSaveState('saved')
    } catch (error) {
      setMediaAssetIds(previousIds)
      setSaveState('error')
      setNotice(
        error instanceof Error && error.message === 'revision_conflict'
          ? localize(
              locale,
              '草稿已在其他页面更改。请刷新后继续。',
              'The Draft changed in another tab. Refresh before continuing.',
            )
          : localize(
              locale,
              '无法保存草稿。当前已发布的照片没有变化。',
              'The Draft could not be saved. Published photos are unchanged.',
            ),
      )
    }
  }

  function move(mediaAssetId: string, direction: -1 | 1) {
    const index = mediaAssetIds.indexOf(mediaAssetId)
    const destination = index + direction
    if (index < 0 || destination < 0 || destination >= mediaAssetIds.length) return
    const nextIds = [...mediaAssetIds]
    ;[nextIds[index], nextIds[destination]] = [
      nextIds[destination]!,
      nextIds[index]!,
    ]
    void save(nextIds)
  }

  function dropBefore(event: DragEvent<HTMLLIElement>, destinationId: string) {
    event.preventDefault()
    const sourceId = draggedId
    setDraggedId(null)
    if (
      !sourceId ||
      sourceId === destinationId ||
      !mediaAssetIds.includes(sourceId)
    ) {
      return
    }
    const nextIds = mediaAssetIds.filter((id) => id !== sourceId)
    const destination = nextIds.indexOf(destinationId)
    if (destination < 0) return
    nextIds.splice(destination, 0, sourceId)
    void save(nextIds)
  }

  async function publish() {
    if (
      invalidIds.length > 0 ||
      !globalThis.confirm(
        localize(
          locale,
          `发布这组照片？${mediaAssetIds.length} 张照片会同时更新照片页和首页预览。`,
          `Publish this Photo Selection? ${mediaAssetIds.length} photos will update the photos page and homepage previews together.`,
        ),
      )
    ) {
      return
    }
    setPublishing(true)
    setNotice(null)
    const idempotencyKey = publishKeyRef.current ?? crypto.randomUUID()
    publishKeyRef.current = idempotencyKey
    try {
      const response = await fetch('/api/admin/media/photo-selection/publish', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          expectedDraftRevision: revision,
          idempotencyKey,
        }),
      })
      await responseJson(response)
      publishKeyRef.current = null
      setNotice(
        localize(
          locale,
          `已发布 ${mediaAssetIds.length} 张照片。`,
          `${mediaAssetIds.length} photos published.`,
        ),
      )
    } catch (error) {
      const code = error instanceof Error ? error.message : ''
      setNotice(
        code === 'ineligible_assets'
          ? localize(
              locale,
              '草稿中有不再符合发布条件的媒体素材。请移除或修复后重试。',
              'The Draft contains Media Assets that are no longer eligible. Remove or repair them, then try again.',
            )
          : code === 'cache_invalidation_failed'
            ? localize(
                locale,
                '照片选择已发布，但公共缓存尚未刷新。请重试发布以安全完成刷新。',
                'The Photo Selection was published, but its public cache was not refreshed. Retry Publish to safely finish the refresh.',
              )
            : localize(
                locale,
                '无法确认发布状态。请安全重试这份草稿。',
                'Publication could not be confirmed. Safely retry this Draft.',
              ),
      )
    } finally {
      setPublishing(false)
    }
  }

  const disabled = saveState === 'saving' || publishing

  return (
    <main>
      <div className="flex flex-wrap items-end justify-between gap-5 border-b border-dashed border-border pb-7">
        <div className="max-w-2xl">
          <p className="text-sm font-medium tracking-[0.12em] text-muted-foreground">
            <T zh="照片选择" en="PHOTO SELECTION" />
          </p>
          <h1 className="mt-2 text-sm font-semibold">
            <T zh="编排下一次发布" en="Curate the next publication" />
          </h1>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">
            <T
              zh="这里的更改会自动保存为草稿。只有发布后，照片页和首页预览才会一起更新。"
              en="Changes autosave to the Draft. The photos page and homepage previews update together only when you publish."
            />
          </p>
        </div>
        <div className="flex items-center gap-4">
          <span aria-live="polite" className="text-sm text-muted-foreground">
            {saveState === 'saving' && <T zh="正在保存…" en="Saving…" />}
            {saveState === 'saved' && <T zh="草稿已保存" en="Draft saved" />}
            {saveState === 'error' && <T zh="保存失败" en="Save failed" />}
          </span>
          <button
            type="button"
            onClick={publish}
            disabled={disabled || invalidIds.length > 0}
            className="min-h-11 rounded-md bg-foreground px-5 text-sm font-medium text-background outline-none transition-transform active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50 focus-visible:ring-1 focus-visible:ring-foreground focus-visible:ring-offset-2 motion-reduce:transform-none"
          >
            {publishing ? (
              <T zh="正在发布…" en="Publishing…" />
            ) : (
              <T zh="发布" en="Publish" />
            )}
          </button>
        </div>
      </div>

      {notice && (
        <p
          ref={noticeRef}
          role="status"
          tabIndex={-1}
          className="mt-5 rounded-md bg-surface-1 px-4 py-3 text-sm leading-6 outline-none"
        >
          {notice}
        </p>
      )}

      {invalidIds.length > 0 && (
        <p
          role="alert"
          className="mt-5 border-l-2 border-foreground pl-4 text-sm leading-6"
        >
          <T
            zh="草稿中有不再符合发布条件的媒体素材。请将它移除，或先到媒体页面完成处理与替代文本审核。"
            en="The Draft contains an ineligible Media Asset. Remove it, or finish processing and Alt Text review in Media before publishing."
          />
        </p>
      )}

      <div className="mt-8 grid gap-12 xl:grid-cols-[minmax(0,1.25fr)_minmax(20rem,0.75fr)]">
        <section aria-labelledby="draft-heading">
          <div className="flex items-baseline justify-between gap-4">
            <h2 id="draft-heading" className="text-sm font-semibold">
              <T zh="草稿" en="Draft" />
            </h2>
            <span className="text-sm tabular-nums text-muted-foreground">
              {mediaAssetIds.length} <T zh="张照片" en="photos" />
            </span>
          </div>

          {mediaAssetIds.length === 0 ? (
            <p className="mt-4 border-t border-dashed border-border py-10 text-sm leading-6 text-muted-foreground">
              <T
                zh="草稿是空的。从可用媒体素材中添加照片，或发布一个有意为空的照片选择。"
                en="The Draft is empty. Add photos from eligible Media Assets, or publish an intentionally empty Photo Selection."
              />
            </p>
          ) : (
            <ol className="mt-4 divide-y divide-border/70 border-y border-dashed border-border">
              {mediaAssetIds.map((mediaAssetId, index) => {
                const asset = assetById.get(mediaAssetId)
                const isInvalid = !asset || !eligible(asset)
                return (
                  <li
                    key={mediaAssetId}
                    onDragOver={(event) => event.preventDefault()}
                    onDrop={(event) => dropBefore(event, mediaAssetId)}
                    className="grid grid-cols-[3rem_5.5rem_minmax(0,1fr)] items-center gap-3 py-3 sm:grid-cols-[3rem_7rem_minmax(0,1fr)_auto]"
                  >
                    <span className="text-center text-sm tabular-nums text-muted-foreground">
                      {String(index + 1).padStart(2, '0')}
                    </span>
                    <span className="aspect-[4/3] overflow-hidden rounded-md bg-surface-1">
                      {asset ? <PreviewImage asset={asset} cropped /> : null}
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">
                        {asset ? assetName(asset) : mediaAssetId.slice(0, 8)}
                      </p>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {index < 3 ? (
                          <T zh="首页预览" en="Homepage preview" />
                        ) : (
                          <T zh="照片页" en="Photos page" />
                        )}
                        {isInvalid && (
                          <>
                            <span aria-hidden="true"> · </span>
                            <T zh="不符合发布条件" en="Ineligible" />
                          </>
                        )}
                      </p>
                    </div>
                    <div className="col-span-3 flex justify-end gap-1 sm:col-span-1">
                      <button
                        type="button"
                        draggable={!disabled}
                        onDragStart={(event) => {
                          setDraggedId(mediaAssetId)
                          event.dataTransfer.setData('text/plain', mediaAssetId)
                          event.dataTransfer.effectAllowed = 'move'
                        }}
                        onDragEnd={() => setDraggedId(null)}
                        disabled={disabled}
                        className="min-h-11 cursor-grab px-3 text-sm text-muted-foreground outline-none disabled:cursor-default disabled:opacity-50 focus-visible:rounded-sm focus-visible:ring-1 focus-visible:ring-foreground"
                      >
                        <T zh="拖动" en="Drag" />
                      </button>
                      <button
                        type="button"
                        onClick={() => move(mediaAssetId, -1)}
                        disabled={disabled || index === 0 || isInvalid}
                        aria-label={localize(locale, '向前移动', 'Move earlier')}
                        className="min-h-11 min-w-11 text-sm outline-none disabled:opacity-30 focus-visible:rounded-sm focus-visible:ring-1 focus-visible:ring-foreground"
                      >
                        <svg
                          viewBox="0 0 16 16"
                          aria-hidden="true"
                          className="mx-auto size-4"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.5"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <path d="m4.5 9.5 3.5-3 3.5 3" />
                        </svg>
                      </button>
                      <button
                        type="button"
                        onClick={() => move(mediaAssetId, 1)}
                        disabled={disabled || index === mediaAssetIds.length - 1 || isInvalid}
                        aria-label={localize(locale, '向后移动', 'Move later')}
                        className="min-h-11 min-w-11 text-sm outline-none disabled:opacity-30 focus-visible:rounded-sm focus-visible:ring-1 focus-visible:ring-foreground"
                      >
                        <svg
                          viewBox="0 0 16 16"
                          aria-hidden="true"
                          className="mx-auto size-4"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.5"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <path d="m4.5 6.5 3.5 3 3.5-3" />
                        </svg>
                      </button>
                      <button
                        type="button"
                        onClick={() => void save(mediaAssetIds.filter((id) => id !== mediaAssetId))}
                        disabled={disabled}
                        className="min-h-11 px-3 text-sm text-muted-foreground outline-none disabled:opacity-50 focus-visible:rounded-sm focus-visible:ring-1 focus-visible:ring-foreground"
                      >
                        <T zh="移除" en="Remove" />
                      </button>
                    </div>
                  </li>
                )
              })}
            </ol>
          )}
        </section>

        <aside className="min-w-0 xl:border-l xl:border-dashed xl:border-border xl:pl-8">
          <section aria-labelledby="homepage-preview-heading">
            <h2 id="homepage-preview-heading" className="text-sm font-medium">
              <T zh="首页预览顺序" en="Homepage preview order" />
            </h2>
            <p className="mt-2 text-sm leading-5 text-muted-foreground">
              <T zh="草稿中的前三张照片。" en="The first three photos in the Draft." />
            </p>
            <ol className="mt-4 grid grid-cols-3 gap-2">
              {mediaAssetIds.slice(0, 3).map((mediaAssetId, index) => {
                const asset = assetById.get(mediaAssetId)
                return (
                  <li key={mediaAssetId} className="relative aspect-square overflow-hidden rounded-md bg-surface-1">
                    {asset && <PreviewImage asset={asset} cropped />}
                    <span className="absolute left-1.5 top-1.5 rounded-sm bg-background/85 px-1.5 py-0.5 text-sm tabular-nums">
                      {index + 1}
                    </span>
                  </li>
                )
              })}
            </ol>
          </section>

          <section aria-labelledby="eligible-heading" className="mt-10 border-t border-dashed border-border pt-7">
            <h2 id="eligible-heading" className="text-sm font-medium">
              <T zh="可用媒体素材" en="Eligible Media Assets" />
            </h2>
            <p className="mt-2 text-sm leading-5 text-muted-foreground">
              <T
                zh="仅显示已处理完成且中英文替代文本都已审核的素材。"
                en="Only ready Media Assets with approved Chinese and English Alt Text appear here."
              />
            </p>
            {availableAssets.length === 0 ? (
              <p className="mt-4 text-sm leading-6 text-muted-foreground">
                <T zh="没有其他可用素材。" en="No other eligible Media Assets." />
              </p>
            ) : (
              <ul className="mt-5 grid grid-cols-2 gap-x-3 gap-y-6 sm:grid-cols-3 xl:grid-cols-2">
                {availableAssets.map((asset) => (
                  <li key={asset.id}>
                    <span className="block aspect-[4/3] overflow-hidden rounded-md bg-surface-1">
                      <PreviewImage asset={asset} />
                    </span>
                    <p className="mt-2 truncate text-sm font-medium">{assetName(asset)}</p>
                    <button
                      type="button"
                      onClick={() => void save([...mediaAssetIds, asset.id])}
                      disabled={disabled}
                      className="mt-1 min-h-11 px-1 text-sm text-muted-foreground outline-none disabled:opacity-50 focus-visible:rounded-sm focus-visible:ring-1 focus-visible:ring-foreground"
                    >
                      <T zh="添加到草稿" en="Add to Draft" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </aside>
      </div>
    </main>
  )
}
