import type { Metadata } from 'next'
// Experimental React channel export — available because next.config.ts sets
// experimental.viewTransition (see docs/design-language.md, page transitions)
import { Suspense, ViewTransition } from 'react'

import { AmbientBackground } from '~/components/ambient-background'
import { Dock, DockFallback } from '~/components/dock'
import { LocaleRestorer } from '~/components/locale-restorer'
import { SiteFooter } from '~/components/site-footer'
import { ThemeProvider } from '~/components/theme-provider'
import { getGitHub, getSocial } from '~/lib/social-live'
import { PREPAINT_SCRIPT } from '~/lib/security/inline-scripts'
import { seo } from '~/lib/seo'
import type { Locale } from '~/lib/locale-route'
import { cn } from '~/lib/utils'

import { fontVariables } from '../fonts'

export const rootMetadata: Metadata = {
  metadataBase: seo.url,
  title: {
    default: 'Cali Castle',
    template: '%s | Cali Castle',
  },
}

export async function SiteDocument({
  children,
  locale,
  restoreLocale = false,
}: Readonly<{
  children: React.ReactNode
  locale: Locale
  restoreLocale?: boolean
}>) {
  // Live-but-cached social numbers (ISR via the fetch data cache) keep the
  // shared chrome fresh without making any page request-bound.
  const [social, github] = await Promise.all([getSocial(), getGitHub()])
  const english = locale === 'en'

  return (
    <html
      lang={english ? 'en' : 'zh-CN'}
      data-locale={english ? 'en' : undefined}
      suppressHydrationWarning
      className={cn('font-sans', fontVariables)}
    >
      <head>
        {/* Pre-paint handles the visited flag and theme. Locale restoration
            is intentionally limited to /admin; public URLs are explicit. */}
        <script dangerouslySetInnerHTML={{ __html: PREPAINT_SCRIPT }} />
      </head>
      <body className="antialiased">
        <ThemeProvider>
          {restoreLocale && <LocaleRestorer />}
          <AmbientBackground />
          <div className="flex min-h-screen flex-col pb-20">
            <main className="flex-1 pt-14">
              <ViewTransition>{children}</ViewTransition>
            </main>
            <SiteFooter social={social} github={github} locale={locale} />
          </div>
          <Suspense fallback={<DockFallback locale={locale} />}>
            <Dock />
          </Suspense>
        </ThemeProvider>
      </body>
    </html>
  )
}
