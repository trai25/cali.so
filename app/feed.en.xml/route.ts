import RSS from 'rss'
import { cacheLife } from 'next/cache'

import { getAllPosts } from '~/lib/content'
import { seoEn } from '~/lib/seo'

export function buildEnglishFeedXml() {
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

  return feed.xml()
}

async function getEnglishFeedXml() {
  'use cache'
  cacheLife('max')

  return buildEnglishFeedXml()
}

export async function GET() {
  return new Response(await getEnglishFeedXml(), {
    headers: { 'content-type': 'application/xml' },
  })
}
