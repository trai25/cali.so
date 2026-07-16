import { PhotosPageView } from '../../_views/photos-page'
import { localeMetadata } from '~/lib/locale-metadata'
import { publicPageMetadata } from '~/lib/public-page-metadata'

// The active photo publication is request-time data and must not block
// navigation validation.
export const instant = false

const copy = publicPageMetadata.photos.zh

export const metadata = localeMetadata({
  locale: 'zh',
  path: '/photos',
  ...copy,
})

export default function ChinesePhotosPage() {
  return <PhotosPageView />
}
