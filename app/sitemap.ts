import type { MetadataRoute } from 'next'

import { getAllPosts } from '~/lib/content'
import { seo } from '~/lib/seo'

export default function sitemap(): MetadataRoute.Sitemap {
  const posts = getAllPosts()
  // newest first per getAllPosts — the site "changed" when the latest post landed
  const latest = posts[0]?.publishedAt

  return [
    { url: seo.url.href, lastModified: latest },
    { url: new URL('/blog', seo.url).href, lastModified: latest },
    ...posts.map((post) => ({
      url: new URL(`/blog/${post.slug}`, seo.url).href,
      lastModified: post.publishedAt,
    })),
  ]
}
