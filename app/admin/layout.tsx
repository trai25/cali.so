import '../globals.css'

import { rootMetadata, SiteDocument } from '../_components/site-document'

export const metadata = rootMetadata

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
