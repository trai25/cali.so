import { createSiteOgImage } from '~/lib/og-image'
import { archivedNewsletterIds } from '~/lib/newsletters'

export function generateStaticParams() {
  return archivedNewsletterIds.map((id) => ({ id }))
}

export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'
export const alt = 'Cali Castle'

export default async function OpengraphImage() {
  return createSiteOgImage('zh')
}
