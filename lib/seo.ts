import { publicPageMetadata } from './public-page-metadata'

function publicSiteUrl() {
  const url = new URL(
    process.env.PUBLIC_SITE_URL ??
      (process.env.NODE_ENV === 'production' ? 'https://cali.so' : 'http://localhost:3199'),
  )
  if (
    url.protocol !== 'https:' &&
    !['localhost', '127.0.0.1'].includes(url.hostname)
  ) {
    throw new Error('PUBLIC_SITE_URL must use HTTPS outside local development')
  }
  return url
}

export const seo = {
  title: publicPageMetadata.home.zh.title,
  description: publicPageMetadata.home.zh.description,
  url: publicSiteUrl(),
} as const

export const seoEn = {
  title: publicPageMetadata.home.en.title,
  description: publicPageMetadata.home.en.description,
  url: seo.url,
} as const
