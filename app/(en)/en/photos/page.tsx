import { PhotosPageView } from '../../../_views/photos-page'
import { localeMetadata } from '~/lib/locale-metadata'

// The active photo publication is request-time data and must not block
// navigation validation.
export const instant = false

export const metadata = localeMetadata({
  locale: 'en',
  path: '/photos',
  title: 'Photos',
  description: "Cali's photo wall",
})

export default function EnglishPhotosPage() {
  return <PhotosPageView />
}
