import type { Metadata } from 'next'
import { redirect } from 'next/navigation'

import { requireAmaAdminEnabled } from '~/lib/ama/admin/launch-boundary-server'
import { T } from '~/lib/i18n'
import { isOwnerAuthenticated } from '~/lib/ama/auth/server'

import { LoginForm } from './LoginForm'

export const metadata: Metadata = {
  title: 'AMA Admin',
  robots: { index: false, follow: false },
}

export default async function AdminLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ sent?: string; error?: string }>
}) {
  requireAmaAdminEnabled()
  if (await isOwnerAuthenticated()) redirect('/admin')
  const state = await searchParams
  const sent = state.sent === '1'
  const invalidLink = state.error === 'invalid-link'

  return (
    <div className="mx-auto w-full max-w-[37.5rem] px-6">
      <section className="mx-auto max-w-sm" aria-labelledby="admin-login-heading">
        <p className="text-sm text-muted-foreground">AMA / ADMIN</p>
        <h1 id="admin-login-heading" className="mt-3 text-sm font-semibold">
          <T zh="管理员登录" en="Admin sign in" />
        </h1>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">
          <T
            zh="输入管理员邮箱，我们会发送一条 15 分钟内有效的一次性登录链接。"
            en="Enter the owner email and we’ll send a single-use link valid for 15 minutes."
          />
        </p>

        {sent && (
          <p role="status" className="mt-5 rounded-md bg-surface-1 px-4 py-3 text-sm leading-6">
            <T
              zh="如果这个邮箱可以登录，链接已经发出。请检查收件箱。"
              en="If that address can sign in, the link is on its way. Check the inbox."
            />
          </p>
        )}
        {invalidLink && (
          <p role="alert" className="mt-5 rounded-md bg-surface-1 px-4 py-3 text-sm leading-6">
            <T
              zh="这个登录链接无效、已使用或已经过期。请重新申请。"
              en="That sign-in link is invalid, already used, or expired. Request a new one."
            />
          </p>
        )}

        <LoginForm />
      </section>
    </div>
  )
}
