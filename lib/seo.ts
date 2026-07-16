import { publicPageMetadata } from './public-page-metadata'

export const seo = {
  title: publicPageMetadata.home.zh.title,
  description: publicPageMetadata.home.zh.description,
  url: new URL(
    process.env.NODE_ENV === 'production' ? 'https://cali.so' : 'http://localhost:3199',
  ),
} as const

export const seoEn = {
  title: publicPageMetadata.home.en.title,
  description: publicPageMetadata.home.en.description,
  url: seo.url,
} as const
