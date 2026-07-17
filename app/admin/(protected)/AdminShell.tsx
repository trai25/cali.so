'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

import { T } from '~/lib/i18n'

const navigation = [
  { href: '/admin', zh: '控制台', en: 'Dashboard' },
  { href: '/admin/media', zh: '媒体', en: 'Media' },
  { href: '/admin/photos', zh: '照片', en: 'Photos' },
] as const

export function AdminShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()

  return (
    <div className="mx-auto grid min-h-dvh w-full max-w-[90rem] grid-cols-1 grid-rows-[auto_auto_1fr] px-4 sm:px-6 lg:grid-cols-[11rem_minmax(0,1fr)] lg:grid-rows-[auto_1fr] lg:px-8">
      <header className="grid min-h-16 grid-cols-[minmax(0,1fr)_auto] items-center gap-4 border-b border-dashed border-border lg:col-span-2">
        <Link
          href="/admin"
          className="text-sm font-medium tracking-[-0.011em] text-muted-foreground outline-none focus-visible:rounded-sm focus-visible:ring-1 focus-visible:ring-foreground"
        >
          CALI / ADMIN
        </Link>
        <form action="/api/admin/auth/logout" method="post">
          <button
            type="submit"
            className="min-h-11 touch-manipulation px-2 text-sm text-muted-foreground outline-none transition-transform duration-100 active:scale-[0.97] focus-visible:rounded-sm focus-visible:ring-1 focus-visible:ring-foreground motion-reduce:transform-none"
          >
            <T zh="退出" en="Sign out" />
          </button>
        </form>
      </header>
      <nav
        aria-label="Admin"
        style={
          {
            '--admin-nav-columns': navigation.length,
          } as React.CSSProperties
        }
        className="grid grid-cols-[repeat(var(--admin-nav-columns),minmax(0,1fr))] gap-1 border-b border-dashed border-border py-3 lg:grid-cols-1 lg:content-start lg:border-b-0 lg:border-r lg:py-6 lg:pr-4"
      >
        {navigation.map((item) => {
          const selected =
            item.href === '/admin'
              ? pathname === item.href
              : pathname.startsWith(item.href)
          return (
            <Link
              key={item.href}
              href={item.href}
              prefetch={false}
              aria-current={selected ? 'page' : undefined}
              className={`flex min-h-11 min-w-0 items-center justify-center rounded-md px-3 text-sm outline-none focus-visible:ring-1 focus-visible:ring-foreground lg:justify-start ${
                selected
                  ? 'bg-foreground text-background'
                  : 'text-muted-foreground hover:bg-hover hover:text-foreground'
              }`}
            >
              <T zh={item.zh} en={item.en} />
            </Link>
          )
        })}
      </nav>
      <main className="min-w-0 py-6 lg:px-8 lg:py-8">{children}</main>
    </div>
  )
}
