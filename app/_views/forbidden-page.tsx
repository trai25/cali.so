import Link from 'next/link'

import { T } from '~/lib/i18n'

export function ForbiddenPageView() {
  return (
    <div className="mx-auto w-full max-w-[37.5rem] px-6">
      <section aria-labelledby="forbidden-title" className="mx-auto max-w-sm">
        <p className="text-sm text-muted-foreground">ADMIN / 403</p>
        <h1 id="forbidden-title" className="mt-3 text-sm font-semibold">
          <T zh="这个账户没有管理员权限。" en="This account is not the site owner." />
        </h1>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">
          <T
            zh="请使用标记为网站所有者的 Clerk 账户登录。管理员数据未被加载。"
            en="Sign in with the Clerk account marked as the site owner. No admin data was loaded."
          />
        </p>
        <Link
          href="/"
          className="mt-6 inline-flex min-h-11 items-center rounded-md px-3 text-sm font-medium text-foreground shadow-[0_0_0_1px_var(--border)] outline-none focus-visible:ring-1 focus-visible:ring-foreground focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          <T zh="返回首页" en="Go home" />
        </Link>
      </section>
    </div>
  )
}
