import { PhotosPageView } from '../../_views/photos-page'
import { localeMetadata } from '~/lib/locale-metadata'
import { publicPageMetadata } from '~/lib/public-page-metadata'

// The active photo publication streams into a prefetched masonry shell.
export const instant = true

const copy = publicPageMetadata.photos.zh

export const metadata = localeMetadata({
  locale: 'zh',
  path: '/photos',
  ...copy,
})

export default function ChinesePhotosPage() {
  return <PhotosPageView />
}
