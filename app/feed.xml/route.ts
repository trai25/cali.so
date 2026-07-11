import RSS from 'rss'

import { getAllPosts } from '~/lib/content'
import { seo } from '~/lib/seo'

// Content is filesystem-based, so the feed is fully static — it only
// changes with a deploy. /feed, /rss and /rss.xml rewrite here.
export const dynamic = 'force-static'

export function GET() {
  const feed = new RSS({
    title: seo.title,
    description: seo.description,
    site_url: seo.url.href,
    feed_url: `${seo.url.href}feed.xml`,
    language: 'zh-CN',
    generator: 'PHP 9.0',
  })

  for (const post of getAllPosts()) {
    const url = `${seo.url.href}blog/${post.slug}`
    feed.item({
      title: post.title,
      guid: url,
      url,
      description: post.description ?? '',
      date: post.publishedAt,
      ...(post.cover && { enclosure: { url: new URL(post.cover.src, seo.url).href } }),
    })
  }

  return new Response(feed.xml(), {
    headers: { 'content-type': 'application/xml' },
  })
}
