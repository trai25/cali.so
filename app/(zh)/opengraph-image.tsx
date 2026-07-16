import { createHomeOgImage } from '~/lib/og-image'

export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'
export const alt = 'Cali Castle。我是 Cali，两个孩子的爸爸，也是一名热爱把细节做到刚刚好的设计工程师。'

export default async function OpengraphImage() {
  return createHomeOgImage('zh')
}
