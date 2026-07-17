import { Suspense } from 'react'

import {
  PublishedPhotoWall,
  PublishedPhotoWallLoading,
} from '~/components/published-photo-wall'
import { T } from '~/lib/i18n'
import { getPublishedPhotoSelection } from '~/lib/media/photo-selection/server'

export function PhotosPageView() {
  return (
    <div className="mx-auto w-full max-w-[37.5rem] px-6">
      <h1 className="enter text-sm font-medium text-muted-foreground">
        <T zh="照片" en="Photos" />
      </h1>
      <Suspense fallback={<PublishedPhotoWallLoading />}>
        <PublishedPhotoMasonry />
      </Suspense>
    </div>
  )
}

async function PublishedPhotoMasonry() {
  const selection = await getPublishedPhotoSelection()
  return <PublishedPhotoWall selection={selection} />
}
