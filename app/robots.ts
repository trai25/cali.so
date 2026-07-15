import type { MetadataRoute } from 'next'

import { seo } from '~/lib/seo'

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: ['/admin', '/api/admin', '/confirm/', '/en/confirm/'],
    },
    sitemap: new URL('/sitemap.xml', seo.url).href,
    host: seo.url.origin,
  }
}
