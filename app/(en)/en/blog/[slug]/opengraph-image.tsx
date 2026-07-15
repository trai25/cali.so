import { notFound } from 'next/navigation'

import { getAllPosts, getPost, isPostSlug } from '~/lib/content'
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
  const { slug } = await params
  if (!isPostSlug(slug)) notFound()
  const post = getPost(slug)
  return createPostOgImage(post, 'en')
}
