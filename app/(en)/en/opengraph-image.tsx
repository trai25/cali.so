import { createHomeOgImage } from '~/lib/og-image'

export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'
export const alt =
  "Cali Castle. I'm Cali, a father of two and a design engineer who loves getting the details just right."

export default async function OpengraphImage() {
  return createHomeOgImage('en')
}
