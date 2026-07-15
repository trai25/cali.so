'use client'

import { usePathname } from 'next/navigation'

export function SiteFrame({
  children,
  dock,
  footer,
}: {
  children: React.ReactNode
  dock: React.ReactNode
  footer: React.ReactNode
}) {
  const pathname = usePathname()
  const admin = pathname === '/admin' || pathname.startsWith('/admin/')

  if (admin) return <main className="min-h-dvh">{children}</main>

  return (
    <>
      <div className="flex min-h-screen flex-col pb-20">
        <main className="flex-1 pt-14">{children}</main>
        {footer}
      </div>
      {dock}
    </>
  )
}
