import type { Metadata } from 'next'

import { HomePageView } from '../_views/home-page'
import { localeMetadata } from '~/lib/locale-metadata'
import { seo } from '~/lib/seo'

export const dynamic = 'force-dynamic'

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
