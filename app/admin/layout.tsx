import '../globals.css'

import { requireAmaAdminEnabled } from '~/lib/ama/admin/launch-boundary-server'

import { rootMetadata, SiteDocument } from '../_components/site-document'

export const metadata = rootMetadata

// Admin authentication and account data intentionally render per request.
export const instant = false
export const prefetch = 'force-disabled'

export default function AdminRootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  requireAmaAdminEnabled()
  return (
    <SiteDocument locale="zh" restoreLocale>
      {children}
    </SiteDocument>
  )
}
