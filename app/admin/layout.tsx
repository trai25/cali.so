import '../globals.css'
import type { Metadata } from 'next'

import { rootMetadata, SiteDocument } from '../_components/site-document'
import { nonPublicRobots } from '~/lib/non-public-metadata'

export const metadata: Metadata = {
  ...rootMetadata,
  robots: nonPublicRobots,
}

// Admin authentication and account data intentionally render per request.
export const instant = false
export const prefetch = 'force-disabled'

export default function AdminRootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <SiteDocument isAdmin locale="zh" restoreLocale>
      {children}
    </SiteDocument>
  )
}
