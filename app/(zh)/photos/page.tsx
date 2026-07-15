import { PhotosPageView } from '../../_views/photos-page'
import { localeMetadata } from '~/lib/locale-metadata'

// The active photo publication is request-time data and must not block
// navigation validation.
export const instant = false

export const metadata = localeMetadata({
  locale: 'zh',
  path: '/photos',
  title: '照片',
  description: 'Cali 的照片墙',
})

export default function ChinesePhotosPage() {
  return <PhotosPageView />
}
