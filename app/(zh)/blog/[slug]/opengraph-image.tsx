import { notFound } from 'next/navigation'

import { getAllPosts, getPost, isPostSlug } from '~/lib/content'
import { createPostOgImage } from '~/lib/og-image'

export function generateStaticParams() {
  return getAllPosts().map((post) => ({ slug: post.slug }))
}

const size = { width: 1200, height: 630 }

export function generateImageMetadata({ params }: { params: { slug: string } }) {
  if (!isPostSlug(params.slug)) return []
  const post = getPost(params.slug)
  return [
    {
      id: params.slug,
      alt: `${post.title} · Cali Castle`,
      size,
      contentType: 'image/png',
    },
  ]
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
