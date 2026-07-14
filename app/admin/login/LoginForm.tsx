'use client'

import { useState } from 'react'

import { T } from '~/lib/i18n'

export function LoginForm() {
  const [pending, setPending] = useState(false)

  return (
    <form
      action="/api/admin/auth/request"
      method="post"
      className="mt-6"
      onSubmit={() => setPending(true)}
    >
      <label htmlFor="admin-email" className="block text-sm font-medium">
        <T zh="邮箱" en="Email" />
      </label>
      <input
        id="admin-email"
        name="email"
        type="email"
        inputMode="email"
        autoComplete="email"
        required
        disabled={pending}
        className="mt-2 min-h-11 w-full rounded-md bg-background px-3 text-base shadow-[0_0_0_1px_var(--border)] outline-none transition-[box-shadow] duration-150 ease-[ease] disabled:opacity-60 focus-visible:shadow-[0_0_0_1px_var(--foreground)] motion-reduce:transition-none"
      />
      <button
        type="submit"
        disabled={pending}
        aria-disabled={pending}
        className="mt-3 min-h-11 w-full touch-manipulation rounded-md bg-foreground px-4 text-sm font-medium text-background outline-none transition-[background-color,transform] duration-100 ease-[ease] active:scale-[0.97] disabled:pointer-events-none disabled:opacity-60 focus-visible:ring-1 focus-visible:ring-foreground focus-visible:ring-offset-2 focus-visible:ring-offset-background motion-reduce:transform-none motion-reduce:transition-none"
      >
        {pending ? (
          <T zh="正在发送…" en="Sending…" />
        ) : (
          <T zh="发送登录链接" en="Send sign-in link" />
        )}
      </button>
    </form>
  )
}
