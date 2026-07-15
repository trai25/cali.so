import type { Metadata } from 'next'

import { LocalizedMetadata } from '~/components/localized-metadata'
import { PublishedPhotoWall } from '~/components/published-photo-wall'
import { T } from '~/lib/i18n'
import { getPublishedPhotoSelection } from '~/lib/media/photo-selection/server'

export const metadata: Metadata = {
  title: 'Photos',
  description: "Cali's photo wall",
}

export const dynamic = 'force-dynamic'

export default async function PhotosPage() {
  const selection = await getPublishedPhotoSelection()
  return (
    <div className="mx-auto w-full max-w-[37.5rem] px-6">
      <LocalizedMetadata
        titleZh="照片"
        titleEn="Photos"
        descriptionZh="Cali 的照片墙"
        descriptionEn="Cali's photo wall"
      />
      <h1 className="enter text-sm font-medium text-muted-foreground">
        <T zh="照片" en="Photos" />
      </h1>
      <PublishedPhotoWall selection={selection} />
    </div>
  )
}
