import type { Metadata } from 'next'

import { requireOwnerPage } from '~/lib/admin/server'
import { getMediaAdminServices } from '~/lib/media/admin/server'
import { nonPublicRobots } from '~/lib/non-public-metadata'

import { MediaLibrary } from './MediaLibrary'

export const metadata: Metadata = {
  title: 'Media Library',
  robots: nonPublicRobots,
}

export default async function AdminMediaPage() {
  const owner = await requireOwnerPage('/admin/media')
  const { review } = getMediaAdminServices()
  const [active, archived] = await Promise.all([
    review.listAssets({ ownerUserId: owner.id, view: 'active' }),
    review.listAssets({ ownerUserId: owner.id, view: 'archived' }),
  ])
  return <MediaLibrary initialActive={active} initialArchived={archived} />
}
