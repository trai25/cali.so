import type { Metadata } from 'next'
import { Suspense } from 'react'

import { PixelCluster } from '~/components/pixel-cluster'
import { requireOwnerPage } from '~/lib/admin/server'
import { T } from '~/lib/i18n'
import { getMediaAdminPageServices } from '~/lib/media/admin/server'
import { nonPublicRobots } from '~/lib/non-public-metadata'

import { MediaLibrary } from './MediaLibrary'

export const metadata: Metadata = {
  title: 'Media',
  robots: nonPublicRobots,
}

export const instant = true

function MediaFallback() {
  return (
    <div className="pb-10" aria-busy="true">
      <div className="flex items-center justify-between gap-4">
        <h1 className="page-eyebrow">
          <T zh="媒体" en="Media" />
        </h1>
        <PixelCluster variant={8} className="shrink-0" />
      </div>
      <div className="mt-1 flex h-10 items-center justify-between gap-4">
        <p className="text-sm tabular-nums text-muted-foreground">…</p>
        <span className="inline-flex h-8 items-center rounded-full bg-surface-1 px-3.5 text-[12px] text-muted-foreground">
          <T zh="传输" en="Transfers" />
        </span>
      </div>
      {/* The final controls occupy this exact 32px command row. */}
      <div className="mt-4 flex min-h-8 items-center justify-between gap-3">
        <span className="h-8 w-32 rounded-full bg-surface-1" />
        <span className="h-8 w-40 rounded-sm bg-surface-1" />
      </div>
      <div className="min-h-[25rem]">
        <ul className="mt-4 grid grid-cols-3 gap-2">
          {Array.from({ length: 6 }, (_, index) => (
            <li
              key={index}
              aria-hidden
              className="aspect-square rounded-[2px] bg-surface-1"
            />
          ))}
        </ul>
      </div>
    </div>
  )
}

async function MediaLoader() {
  const owner = await requireOwnerPage('/admin/media')
  const { getDraft, listAssets, listTransfers } = getMediaAdminPageServices()
  const [active, archived, draft, transfers] = await Promise.all([
    listAssets({ ownerUserId: owner.id, view: 'active' }),
    listAssets({ ownerUserId: owner.id, view: 'archived' }),
    getDraft(owner.id),
    listTransfers(owner.id),
  ])
  return (
    <MediaLibrary
      initialActive={active}
      initialArchived={archived}
      initialTransfers={transfers}
      selectionIds={draft.mediaAssetIds}
    />
  )
}

export default function AdminMediaPage() {
  return (
    <Suspense fallback={<MediaFallback />}>
      <MediaLoader />
    </Suspense>
  )
}
