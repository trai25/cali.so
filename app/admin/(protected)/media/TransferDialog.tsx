'use client'

import {
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
} from 'react'

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
import { T } from '~/lib/i18n'
import type { TransferJob } from '~/lib/media/transfer/service'

export type QueueStatus =
  | 'hashing'
  | 'uploading'
  | 'processing'
  | 'ready'
  | 'failed'

export type QueueItem = {
  id: string
  file: File
  idempotencyKey?: string
  uploadIntentId?: string
  mediaAssetId?: string
  checksumSha256?: string
  uploadedChunkCount?: number
  status: QueueStatus
  error?: string
}

export type TransferDiscardTarget = {
  uploadIntentId: string
  label: string
}

const queueErrorCopy: Record<string, { zh: string; en: string }> = {
  invalid_file: {
    zh: '不支持的类型，或超过 50 MiB',
    en: 'Unsupported type, or over 50 MiB',
  },
  upload_failed: { zh: '传输中断', en: 'Transfer interrupted' },
  processing_failed: { zh: '处理失败', en: 'Processing failed' },
  original_mismatch: { zh: '原片校验失败', en: 'Original verification failed' },
  rate_limited: { zh: '操作太频繁，稍后重试', en: 'Rate limited — wait a moment' },
  request_failed: { zh: '请求失败', en: 'Request failed' },
}

function DropZone({
  items,
  onFiles,
  onDiscard,
  onDismiss,
  onRetry,
}: {
  items: QueueItem[]
  onFiles(files: File[]): void
  onDiscard(item: QueueItem): void
  onDismiss(item: QueueItem): void
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
    <div
      onDragEnter={(event) => {
        event.preventDefault()
        setDragging(true)
      }}
      onDragOver={(event) => event.preventDefault()}
      onDragLeave={() => setDragging(false)}
      onDrop={drop}
      className={`rounded-lg border border-dashed px-5 py-4 transition-colors duration-150 ${
        dragging ? 'border-foreground bg-surface-1' : 'border-border'
      }`}
    >
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
        <div>
          <p className="text-sm font-medium">
            <T zh="拖入或选择照片" en="Drop or choose photos" />
          </p>
          <p className="mt-0.5 text-sm text-muted-foreground">
            JPEG · PNG · HEIC · ≤ 50 MiB
          </p>
        </div>
        <Button
          type="button"
          variant="primary"
          size="md"
          expandHitArea
          onClick={() => inputRef.current?.click()}
        >
          <T zh="选择文件" en="Choose files" />
        </Button>
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
        <ol aria-live="polite" className="mt-4 hairline-top">
          {items.map((item) => {
            const cause = item.error
              ? queueErrorCopy[item.error] ?? queueErrorCopy.request_failed!
              : null
            return (
              <li
                key={item.id}
                className="flex min-h-11 items-center justify-between gap-4 py-1.5 text-sm"
              >
                <div className="min-w-0">
                  <p className="truncate">{item.file.name}</p>
                  <p className="text-sm text-muted-foreground">
                    {item.status === 'hashing' && <T zh="正在校验" en="Checking" />}
                    {item.status === 'uploading' && <T zh="正在上传" en="Uploading" />}
                    {item.status === 'processing' && <T zh="正在处理" en="Processing" />}
                    {item.status === 'ready' && <T zh="已入档" en="In the archive" />}
                    {item.status === 'failed' && cause && (
                      <T zh={cause.zh} en={cause.en} />
                    )}
                  </p>
                </div>
                {item.status === 'failed' ? (
                  <div className="flex shrink-0 items-center gap-1">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => onRetry(item)}
                    >
                      <T zh="重试" en="Retry" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      destructive={item.uploadIntentId !== undefined}
                      onClick={() =>
                        item.uploadIntentId ? onDiscard(item) : onDismiss(item)
                      }
                    >
                      {item.uploadIntentId ? (
                        <T zh="丢弃" en="Discard" />
                      ) : (
                        <T zh="移除" en="Dismiss" />
                      )}
                    </Button>
                  </div>
                ) : item.status === 'processing' && item.uploadIntentId ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    destructive
                    onClick={() => onDiscard(item)}
                  >
                    <T zh="丢弃" en="Discard" />
                  </Button>
                ) : (
                  <span className="shrink-0 text-sm tabular-nums text-muted-foreground">
                    {(item.file.size / 1024 / 1024).toFixed(1)} MiB
                  </span>
                )}
              </li>
            )
          })}
        </ol>
      )}
    </div>
  )
}

function transferFileLabel(job: TransferJob) {
  const kind =
    {
      'image/heic': 'HEIC',
      'image/heif': 'HEIF',
      'image/jpeg': 'JPEG',
      'image/png': 'PNG',
    }[job.contentType] ?? 'Image'
  return `${kind} · ${(job.byteSize / 1024 / 1024).toFixed(1)} MiB`
}

function transferStateCopy(job: TransferJob) {
  if (job.stage === 'awaiting_file') {
    return { zh: '等待重新选择原片', en: 'Choose the Original again to resume' }
  }
  if (job.stage === 'processing') return { zh: '正在处理', en: 'Processing' }
  if (job.stage === 'discarding') {
    return { zh: '丢弃未完成，可以安全重试', en: 'Discard incomplete; safe to retry' }
  }
  if (job.processingErrorCode === 'image_unsupported_format') {
    return {
      zh: '无法解码此格式；可导出为 JPEG 或 PNG 后重试',
      en: 'This encoding could not be decoded; export as JPEG or PNG and retry',
    }
  }
  if (job.processingErrorCode === 'capture_location_invalid') {
    return {
      zh: '拍摄位置元数据无效；可移除元数据后重试',
      en: 'Capture Location metadata is invalid; remove it and retry',
    }
  }
  if (job.processingErrorCode === 'storage_not_found') {
    return {
      zh: '找不到原片；请丢弃后重新传输',
      en: 'The Original is missing; discard this job and transfer it again',
    }
  }
  if (
    job.processingErrorCode === 'dependency_unavailable' ||
    job.processingErrorCode?.startsWith('storage_')
  ) {
    return {
      zh: '存储服务暂时不可用，可以安全重试',
      en: 'Storage is temporarily unavailable; it is safe to retry',
    }
  }
  return { zh: '处理失败，可以重试', en: 'Processing failed; retry available' }
}

function PersistedTransferRow({
  job,
  notice,
  pending,
  onChooseFile,
  onDiscard,
  onRetryProcessing,
}: {
  job: TransferJob
  notice?: string
  pending: boolean
  onChooseFile(job: TransferJob, file: File): void
  onDiscard(job: TransferJob): void
  onRetryProcessing(job: TransferJob): void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const state = transferStateCopy(job)

  return (
    <li className="flex min-h-14 items-center justify-between gap-4 py-1.5 text-sm">
      <div className="min-w-0">
        <p className="truncate font-mono text-[12px]">{transferFileLabel(job)}</p>
        <p className="text-sm text-muted-foreground">
          {notice ?? <T zh={state.zh} en={state.en} />}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        {job.stage === 'awaiting_file' && (
          <>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              loading={pending}
              disabled={pending}
              onClick={() => inputRef.current?.click()}
            >
              <T zh="选择原片" en="Choose Original" />
            </Button>
            <input
              ref={inputRef}
              type="file"
              accept=".heic,.heif,.jpg,.jpeg,.png,image/heic,image/heif,image/jpeg,image/png"
              className="sr-only"
              onChange={(event) => {
                const file = event.target.files?.[0]
                if (file) onChooseFile(job, file)
                event.target.value = ''
              }}
            />
          </>
        )}
        {(job.stage === 'failed' || job.stage === 'processing') && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            loading={pending}
            disabled={pending}
            onClick={() => onRetryProcessing(job)}
          >
            <T zh="重试" en="Retry" />
          </Button>
        )}
        {job.stage === 'discarding' && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            destructive
            loading={pending}
            disabled={pending}
            onClick={() => onDiscard(job)}
          >
            <T zh="重试丢弃" en="Retry Discard" />
          </Button>
        )}
        {(
          job.stage === 'awaiting_file' ||
          job.stage === 'processing' ||
          job.stage === 'failed'
        ) && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            destructive
            disabled={pending}
            onClick={() => onDiscard(job)}
          >
            <T zh="丢弃" en="Discard" />
          </Button>
        )}
      </div>
    </li>
  )
}

export function TransferDialog({
  open,
  onOpenChange,
  queue,
  transfers,
  notices,
  pendingTransferId,
  discardTarget,
  onFiles,
  onDismissQueueItem,
  onRetryQueueItem,
  onChooseFile,
  onRetryProcessing,
  onRequestDiscard,
  onCloseDiscard,
  onConfirmDiscard,
}: {
  open: boolean
  onOpenChange(open: boolean): void
  queue: QueueItem[]
  transfers: TransferJob[]
  notices: Record<string, string>
  pendingTransferId: string | null
  discardTarget: TransferDiscardTarget | null
  onFiles(files: File[]): void
  onDismissQueueItem(item: QueueItem): void
  onRetryQueueItem(item: QueueItem): void
  onChooseFile(job: TransferJob, file: File): void
  onRetryProcessing(job: TransferJob): void
  onRequestDiscard(target: TransferDiscardTarget): void
  onCloseDiscard(): void
  onConfirmDiscard(): void
}) {
  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent
          size="lg"
          className="h-[min(38rem,calc(100dvh-2rem))]"
        >
          <DialogHeader>
            <DialogTitle>
              <T zh="传输" en="Transfers" />
            </DialogTitle>
            <DialogClose>
              <T zh="关闭" en="Close" />
            </DialogClose>
          </DialogHeader>
          <DialogDescription>
            <T
              zh="关闭窗口不会停止当前传输。JPEG、PNG、HEIC，最大 50 MiB。"
              en="Closing this dialog does not stop active jobs. JPEG, PNG, or HEIC up to 50 MiB."
            />
          </DialogDescription>
          <DialogBody>
            <DropZone
              items={queue}
              onFiles={onFiles}
              onDiscard={(item) => {
                if (!item.uploadIntentId) return
                onRequestDiscard({
                  uploadIntentId: item.uploadIntentId,
                  label: item.file.name,
                })
              }}
              onDismiss={onDismissQueueItem}
              onRetry={onRetryQueueItem}
            />
            {transfers.length > 0 && (
              <section className="mt-5">
                <h3 className="text-sm font-medium">
                  <T zh="未完成" en="Incomplete" />
                </h3>
                <ol aria-live="polite" className="mt-2 divide-y divide-border">
                  {transfers.map((job) => (
                    <PersistedTransferRow
                      key={job.uploadIntentId}
                      job={job}
                      notice={notices[job.uploadIntentId]}
                      pending={pendingTransferId === job.uploadIntentId}
                      onChooseFile={onChooseFile}
                      onDiscard={(target) =>
                        onRequestDiscard({
                          uploadIntentId: target.uploadIntentId,
                          label: transferFileLabel(target),
                        })
                      }
                      onRetryProcessing={onRetryProcessing}
                    />
                  ))}
                </ol>
              </section>
            )}
          </DialogBody>
        </DialogContent>
      </Dialog>

      <Dialog
        open={discardTarget !== null}
        onOpenChange={(next) => {
          if (!next && pendingTransferId === null) onCloseDiscard()
        }}
      >
        <DialogContent size="sm" className="h-64">
          <DialogHeader>
            <DialogTitle>
              <T zh="丢弃传输" en="Discard Transfer" />
            </DialogTitle>
            <DialogClose disabled={pendingTransferId !== null}>
              <T zh="取消" en="Cancel" />
            </DialogClose>
          </DialogHeader>
          <DialogDescription>
            <T
              zh="未完成的原片、分块和处理记录会永久删除。"
              en={
                'The incomplete Original, chunks, and processing record will be permanently removed.'
              }
            />
          </DialogDescription>
          <DialogBody>
            <p className="truncate text-sm text-muted-foreground">
              {discardTarget?.label}
            </p>
          </DialogBody>
          <DialogFooter>
            <Button
              type="button"
              variant="primary"
              size="md"
              destructive
              loading={pendingTransferId !== null}
              disabled={pendingTransferId !== null}
              onClick={onConfirmDiscard}
            >
              <T zh="永久丢弃" en="Discard Permanently" />
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
