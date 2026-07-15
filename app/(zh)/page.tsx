import type { Metadata } from 'next'

import { HomePageView } from '../_views/home-page'
import { localeMetadata } from '~/lib/locale-metadata'
import { seo } from '~/lib/seo'

// The active photo publication is request-time data and must not block
// navigation validation.
export const instant = false

export const metadata: Metadata = {
  ...localeMetadata({
    locale: 'zh',
    path: '/',
    title: seo.title,
    description: seo.description,
  }),
  title: { absolute: seo.title },
}

export default function ChineseHomePage() {
  return <HomePageView locale="zh" />
}
