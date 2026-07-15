'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

import { T } from '~/lib/i18n'

const navigation = [
  { href: '/admin', zh: '控制台', en: 'Dashboard' },
  { href: '/admin/media', zh: '媒体', en: 'Media' },
  { href: '/admin/photos', zh: '照片', en: 'Photos', disabled: true },
] as const

export function AdminShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()

  return (
    <div className="mx-auto min-h-dvh w-full max-w-[80rem] px-6 pb-16 pt-6 sm:px-8">
      <header className="flex min-h-11 flex-wrap items-center justify-between gap-x-8 gap-y-3 border-b border-dashed border-border pb-5">
        <Link
          href="/admin"
          className="text-xs font-medium tracking-[0.14em] text-muted-foreground outline-none focus-visible:rounded-sm focus-visible:ring-1 focus-visible:ring-foreground"
        >
          CALI / ADMIN
        </Link>
        <nav
          aria-label="Admin"
          className="order-3 flex w-full items-center gap-1 sm:order-none sm:w-auto"
        >
          {navigation.map((item) => {
            const selected =
              item.href === '/admin'
                ? pathname === item.href
                : pathname.startsWith(item.href)
            return 'disabled' in item && item.disabled ? (
              <span
                key={item.href}
                aria-disabled="true"
                className="flex min-h-11 cursor-not-allowed items-center rounded-md px-3 text-sm text-muted-foreground opacity-50"
              >
                <T zh={item.zh} en={item.en} />
              </span>
            ) : (
              <Link
                key={item.href}
                href={item.href}
                aria-current={selected ? 'page' : undefined}
                className={`flex min-h-11 items-center rounded-md px-3 text-sm outline-none transition-colors focus-visible:ring-1 focus-visible:ring-foreground ${
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
        <form action="/api/admin/auth/logout" method="post" className="ml-auto">
          <button
            type="submit"
            className="min-h-11 touch-manipulation px-2 text-sm text-muted-foreground outline-none transition-transform duration-100 active:scale-[0.97] focus-visible:rounded-sm focus-visible:ring-1 focus-visible:ring-foreground motion-reduce:transform-none"
          >
            <T zh="退出" en="Sign out" />
          </button>
        </form>
      </header>
      <div className="pt-8">{children}</div>
    </div>
  )
}
