import type { Metadata } from 'next'
import { redirect } from 'next/navigation'

import { getOwnerPrincipal } from '~/lib/admin/server'
import { getMediaAdminServices } from '~/lib/media/admin/server'

import { MediaLibrary } from './MediaLibrary'

export const metadata: Metadata = {
  title: 'Media Library',
  robots: { index: false, follow: false },
}

export default async function AdminMediaPage() {
  const owner = await getOwnerPrincipal()
  if (!owner) redirect('/admin/login')
  const { review } = getMediaAdminServices()
  const [active, archived] = await Promise.all([
    review.listAssets({ ownerUserId: owner.id, view: 'active' }),
    review.listAssets({ ownerUserId: owner.id, view: 'archived' }),
  ])
  return <MediaLibrary initialActive={active} initialArchived={archived} />
}
