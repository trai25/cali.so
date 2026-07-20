import '../globals.css'
import { ClerkProvider } from '@clerk/nextjs'
import type { Metadata } from 'next'

import { rootMetadata, SiteDocument } from '../_components/site-document'
import {
  nonPublicDescriptions,
  nonPublicRobots,
} from '~/lib/non-public-metadata'

export const metadata: Metadata = {
  ...rootMetadata,
  description: nonPublicDescriptions.admin,
  robots: nonPublicRobots,
}

// The admin document is a static shell (July 2026): the paper, column, and
// owner dock prerender and prefetch, while everything the owner actually
// sees streams from per-request loaders behind each page's Suspense
// boundary. Ownership is enforced by clerkMiddleware plus requireOwnerPage
// inside those loaders. The ClerkProvider below stays non-dynamic (no
// request data, shell still prerenders) and renders no UI — it exists only
// so clerk-js keeps refreshing the 60-second session-token cookie in the
// background. Without it every idle minute ends in a handshake redirect
// and admin API 401 reloads.
export default function AdminRootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <SiteDocument isAdmin locale="zh" restoreLocale>
      <ClerkProvider>{children}</ClerkProvider>
    </SiteDocument>
  )
}
