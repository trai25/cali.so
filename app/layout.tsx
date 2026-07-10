import type { Metadata } from 'next'

import './globals.css'
import { Geist } from "next/font/google";
import { cn } from "~/lib/utils";

const geist = Geist({subsets:['latin'],variable:'--font-sans'});

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
    <html lang="zh-CN" suppressHydrationWarning className={cn("font-sans", geist.variable)}>
      <body className="antialiased">{children}</body>
    </html>
  )
}
