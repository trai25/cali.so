import { getAllPosts, getPost } from '~/lib/content'
import { createPostOgImage } from '~/lib/og-image'

export function generateStaticParams() {
  return getAllPosts().map((post) => ({ slug: post.slug }))
}

export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'
export const alt = 'Cali Castle'

export default async function OpengraphImage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const post = getPost((await params).slug)
  return createPostOgImage(post, 'zh')
}
