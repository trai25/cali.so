import { createHomeOgImage } from '~/lib/og-image'
import { publicPageMetadata } from '~/lib/public-page-metadata'

export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'
export const alt = `Cali Castle。${publicPageMetadata.home.zh.ogDescription}`

export default async function OpengraphImage() {
  return createHomeOgImage('zh')
}
