import type { Metadata } from 'next'

import './globals.css'
import { AmbientBackground } from '~/components/ambient-background'
import { PREPAINT_SCRIPT } from '~/lib/security/inline-scripts'
import { cn } from '~/lib/utils'

import { fontVariables } from './fonts'
import { NotFoundPageView } from './_views/not-found-page'

export const metadata: Metadata = {
  title: '404 | Cali Castle',
}

export default function GlobalNotFound() {
  // Next's global-not-found API receives no pathname, so the static document
  // defaults to Chinese. PREPAINT_SCRIPT derives an explicit /en URL before
  // paint and updates lang/data-locale without consulting localStorage.
  return (
    <html lang="zh-CN" suppressHydrationWarning className={cn('font-sans', fontVariables)}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: PREPAINT_SCRIPT }} />
      </head>
      <body className="antialiased">
        <AmbientBackground />
        <main className="min-h-screen pt-14">
          <NotFoundPageView />
        </main>
      </body>
    </html>
  )
}
