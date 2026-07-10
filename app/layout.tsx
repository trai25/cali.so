import type { Metadata } from 'next'
import { ThemeProvider } from 'next-themes'

import './globals.css'
import { fontVariables } from './fonts'
import { AmbientBackground } from '~/components/ambient-background'
import { SiteFooter } from '~/components/site-footer'
import { SiteHeader } from '~/components/site-header'
import { cn } from '~/lib/utils'

export const metadata: Metadata = {
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
      <body className="antialiased">
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
          <AmbientBackground />
          <div className="flex min-h-screen flex-col">
            <SiteHeader />
            <main className="flex-1 pt-8">{children}</main>
            <SiteFooter />
          </div>
        </ThemeProvider>
      </body>
    </html>
  )
}
