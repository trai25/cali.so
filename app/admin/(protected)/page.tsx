import type { Metadata } from 'next'

import { T } from '~/lib/i18n'

export const metadata: Metadata = {
  title: 'AMA Admin',
  robots: { index: false, follow: false },
}

export default function AdminPage() {
  return (
    <div className="mx-auto w-full max-w-[37.5rem] px-6">
      <header className="flex min-h-11 items-center justify-between gap-6">
        <div>
          <p className="text-sm text-muted-foreground">AMA / ADMIN</p>
          <h1 className="mt-1 text-sm font-semibold">
            <T zh="管理" en="Admin" />
          </h1>
        </div>
        <form action="/api/admin/auth/logout" method="post">
          <button
            type="submit"
            className="relative min-h-11 touch-manipulation px-2 text-sm text-muted-foreground outline-none transition-colors duration-150 ease-[ease] [@media(hover:hover)_and_(pointer:fine)]:hover:text-foreground focus-visible:rounded-sm focus-visible:ring-1 focus-visible:ring-foreground motion-reduce:transition-none"
          >
            <T zh="退出" en="Sign out" />
          </button>
        </form>
      </header>
      <div className="mt-12 border-t border-dashed border-border pt-6 text-sm text-muted-foreground">
        <T zh="AMA 管理工具将在这里出现。" en="AMA management tools will appear here." />
      </div>
    </div>
  )
}
