import { createSectionOgImage } from '~/lib/og-image'
import { publicPageMetadata } from '~/lib/public-page-metadata'

const copy = publicPageMetadata.photos.en

export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'
export const alt = `${copy.title} · Cali Castle. ${copy.description}`

export default async function OpengraphImage() {
  return createSectionOgImage('photos', 'en')
}
