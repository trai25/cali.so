import type { Metadata } from 'next'
import { redirect } from 'next/navigation'

import { getOwnerPrincipal } from '~/lib/admin/server'
import { getMediaAdminServices } from '~/lib/media/admin/server'

import { PhotoSelectionEditor } from './PhotoSelectionEditor'

export const metadata: Metadata = {
  title: 'Photo Selection',
  robots: { index: false, follow: false },
}

export default async function AdminPhotosPage() {
  const owner = await getOwnerPrincipal()
  if (!owner) redirect('/admin/login')

  const { review, selection } = getMediaAdminServices()
  const [draft, assets] = await Promise.all([
    selection.getDraft(owner.id),
    review.listAssets({ ownerUserId: owner.id, view: 'active' }),
  ])

  return <PhotoSelectionEditor initialDraft={draft} initialAssets={assets} />
}
