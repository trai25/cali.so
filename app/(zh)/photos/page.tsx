import { PhotosPageView } from '../../_views/photos-page'
import { localeMetadata } from '~/lib/locale-metadata'

export const dynamic = 'force-dynamic'

export const metadata = localeMetadata({
  locale: 'zh',
  path: '/photos',
  title: '照片',
  description: 'Cali 的照片墙',
})

export default function ChinesePhotosPage() {
  return <PhotosPageView />
}
