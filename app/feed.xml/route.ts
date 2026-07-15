import RSS from 'rss'
import { cacheLife } from 'next/cache'

import { getAllPosts } from '~/lib/content'
import { seo } from '~/lib/seo'

export function buildChineseFeedXml() {
  const feed = new RSS({
    title: seo.title,
    description: seo.description,
    site_url: seo.url.href,
    feed_url: `${seo.url.href}feed.xml`,
    language: 'zh-CN',
    // RSS <image> wants a small square channel logo, not the 1200×630 OG
    image_url: `${seo.url.href}images/avatar.png`,
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

  return feed.xml()
}

async function getChineseFeedXml() {
  'use cache'
  cacheLife('max')

  return buildChineseFeedXml()
}

// Content is filesystem-based, so the cached feed only changes with a
// deployment. /feed, /rss and /rss.xml rewrite here.
export async function GET() {
  return new Response(await getChineseFeedXml(), {
    headers: { 'content-type': 'application/xml' },
  })
}
