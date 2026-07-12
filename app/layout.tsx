import type { Metadata } from 'next'
import { ThemeProvider } from 'next-themes'
// Experimental React channel export — available because next.config.ts sets
// experimental.viewTransition (see docs/design-language.md, page transitions)
import { ViewTransition } from 'react'

import './globals.css'
import { fontVariables } from './fonts'
import { AmbientBackground } from '~/components/ambient-background'
import { Dock } from '~/components/dock'
import { SiteFooter } from '~/components/site-footer'
import { seo } from '~/lib/seo'
import { cn } from '~/lib/utils'

export const metadata: Metadata = {
  metadataBase: seo.url,
  title: {
    default: 'Cali Castle',
    template: '%s | Cali Castle',
  },
  description: 'Cali Castle — developer, designer, founder.',
}

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN" suppressHydrationWarning className={cn('font-sans', fontVariables)}>
      <head>
        {/* pre-paint: visited flag (skips polaroid pops on repeat hard
            loads) + restore the chrome locale before first paint */}
        <script
          dangerouslySetInnerHTML={{
            __html: `try{var d=document.documentElement;if(sessionStorage.v)d.dataset.visited="";sessionStorage.v=1;if(localStorage.locale==="en"){d.dataset.locale="en";d.lang="en"}}catch(e){}`,
          }}
        />
      </head>
      <body className="antialiased">
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
          <AmbientBackground />
          <div className="flex min-h-screen flex-col pb-20">
            <main className="flex-1 pt-14">
              <ViewTransition>{children}</ViewTransition>
            </main>
            <SiteFooter />
          </div>
          <Dock />
        </ThemeProvider>
      </body>
    </html>
  )
}
