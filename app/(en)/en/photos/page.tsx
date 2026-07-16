import { PhotosPageView } from '../../../_views/photos-page'
import { localeMetadata } from '~/lib/locale-metadata'
import { publicPageMetadata } from '~/lib/public-page-metadata'

// The active photo publication is request-time data and must not block
// navigation validation.
export const instant = false

const copy = publicPageMetadata.photos.en

export const metadata = localeMetadata({
  locale: 'en',
  path: '/photos',
  ...copy,
})

export default function EnglishPhotosPage() {
  return <PhotosPageView />
}
