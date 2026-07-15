import type { Metadata } from 'next'
// Experimental React channel export — available because next.config.ts sets
// experimental.viewTransition (see docs/design-language.md, page transitions)
import { ViewTransition } from 'react'

import './globals.css'
import { fontVariables } from './fonts'
import { AmbientBackground } from '~/components/ambient-background'
import { Dock } from '~/components/dock'
import { LocaleRestorer } from '~/components/locale-restorer'
import { getGitHub, getSocial } from '~/lib/social-live'
import { SiteFooter } from '~/components/site-footer'
import { SiteFrame } from '~/components/site-frame'
import { ThemeProvider } from '~/components/theme-provider'
import { PREPAINT_SCRIPT } from '~/lib/security/inline-scripts'
import { seo } from '~/lib/seo'
import { cn } from '~/lib/utils'

export const metadata: Metadata = {
  metadataBase: seo.url,
  title: {
    default: 'Cali Castle',
    template: '%s | Cali Castle',
  },
  description: 'Cali Castle, developer, designer, and founder of Zolplay.',
}

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  // live-but-cached social numbers (ISR via the fetch data cache) — the
  // chrome shows fresh counts without a redeploy
  const [social, github] = await Promise.all([getSocial(), getGitHub()])
  return (
    <html lang="zh-CN" suppressHydrationWarning className={cn('font-sans', fontVariables)}>
      <head>
        {/* pre-paint: visited flag (skips polaroid pops on repeat hard
            loads) + restore the content locale before first paint */}
        <script
          dangerouslySetInnerHTML={{
            __html: PREPAINT_SCRIPT,
          }}
        />
      </head>
      <body className="antialiased">
        <ThemeProvider>
          <LocaleRestorer />
          <AmbientBackground />
          <SiteFrame
            dock={<Dock />}
            footer={<SiteFooter social={social} github={github} />}
          >
            <ViewTransition>{children}</ViewTransition>
          </SiteFrame>
        </ThemeProvider>
      </body>
    </html>
  )
}
