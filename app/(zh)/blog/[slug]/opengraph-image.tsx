import { notFound } from 'next/navigation'

import { getAllPosts, getPost, isPostSlug } from '~/lib/content'
import { createPostOgImage } from '~/lib/og-image'
import { postOgImageMetadata } from '~/lib/og-image-metadata'

export function generateStaticParams() {
  return getAllPosts().map((post) => ({ slug: post.slug }))
}

export function generateImageMetadata({ params }: { params: { slug: string } }) {
  if (!isPostSlug(params.slug)) return []
  return postOgImageMetadata(getPost(params.slug), 'zh')
}

export default async function OpengraphImage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  if (!isPostSlug(slug)) notFound()
  const post = getPost(slug)
  return createPostOgImage(post, 'zh')
}
