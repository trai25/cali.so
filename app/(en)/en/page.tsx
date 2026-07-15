import type { Metadata } from 'next'

import { HomePageView } from '../../_views/home-page'
import { localeMetadata } from '~/lib/locale-metadata'
import { seoEn } from '~/lib/seo'

// The active photo publication is request-time data and must not block
// navigation validation.
export const instant = false

export const metadata: Metadata = {
  ...localeMetadata({
    locale: 'en',
    path: '/',
    title: seoEn.title,
    description: seoEn.description,
  }),
  title: { absolute: seoEn.title },
}

export default function EnglishHomePage() {
  return <HomePageView locale="en" />
}
