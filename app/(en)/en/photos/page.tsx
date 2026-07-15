import { PhotosPageView } from '../../../_views/photos-page'
import { localeMetadata } from '~/lib/locale-metadata'

export const dynamic = 'force-dynamic'

export const metadata = localeMetadata({
  locale: 'en',
  path: '/photos',
  title: 'Photos',
  description: "Cali's photo wall",
})

export default function EnglishPhotosPage() {
  return <PhotosPageView />
}
