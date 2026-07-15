import RSS from 'rss'

import { getAllPosts } from '~/lib/content'
import { seoEn } from '~/lib/seo'

export const dynamic = 'force-static'

export function GET() {
  const siteUrl = new URL('/en', seoEn.url).href

  const feed = new RSS({
    title: seoEn.title,
    description: seoEn.description,
    site_url: siteUrl,
    feed_url: `${seoEn.url.href}feed.en.xml`,
    language: 'en-US',
    image_url: `${seoEn.url.href}images/avatar.png`,
    generator: 'PHP 9.0',
  })

  for (const post of getAllPosts()) {
    const url = new URL(`/en/blog/${post.slug}`, seoEn.url).href
    feed.item({
      title: post.titleEn,
      guid: url,
      url,
      description: post.descriptionEn,
      date: post.publishedAt,
      ...(post.cover && { enclosure: { url: new URL(post.cover.src, seoEn.url).href } }),
    })
  }

  return new Response(feed.xml(), {
    headers: { 'content-type': 'application/xml' },
  })
}
