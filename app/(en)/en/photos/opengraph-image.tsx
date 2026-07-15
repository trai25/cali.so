import { createSiteOgImage } from '~/lib/og-image'

export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'
export const alt = 'Cali Castle'

export default async function OpengraphImage() {
  return createSiteOgImage('en')
}
