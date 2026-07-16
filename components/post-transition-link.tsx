'use client'

import Link from 'next/link'
import type { ReactNode } from 'react'

export function PostTransitionLink({
  href,
  coverTransitionName,
  titleTransitionName,
  className,
  children,
}: {
  href: string
  coverTransitionName: string
  titleTransitionName: string
  className?: string
  children: ReactNode
}) {
  function prepareFallbackMorph() {
    const root = document.documentElement
    root.style.setProperty('--post-cover-transition-name', coverTransitionName)
    root.style.setProperty('--post-title-transition-name', titleTransitionName)
  }

  return (
    <Link
      href={href}
      prefetch={true}
      className={className}
      onNavigate={prepareFallbackMorph}
    >
      {children}
    </Link>
  )
}
