import type { Metadata } from 'next'

import { requireOwnerPage } from '~/lib/admin/server'
import { getMediaAdminServices } from '~/lib/media/admin/server'
import { nonPublicRobots } from '~/lib/non-public-metadata'

import { PhotoSelectionEditor } from './PhotoSelectionEditor'

export const metadata: Metadata = {
  title: 'Photo Selection',
  robots: nonPublicRobots,
}

export default async function AdminPhotosPage() {
  const owner = await requireOwnerPage('/admin/photos')

  const { review, selection } = getMediaAdminServices()
  const [draft, assets] = await Promise.all([
    selection.getDraft(owner.id),
    review.listAssets({ ownerUserId: owner.id, view: 'active' }),
  ])

  return <PhotoSelectionEditor initialDraft={draft} initialAssets={assets} />
}
