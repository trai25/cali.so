import type { Metadata } from 'next'

import './globals.css'
import { fontVariables } from './fonts'
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
      <body className="antialiased">{children}</body>
    </html>
  )
}
