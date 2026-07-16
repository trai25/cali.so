'use client'

import Link from 'next/link'
import type { MouseEvent, ReactNode } from 'react'

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
  function prepareFallbackMorph(event: MouseEvent<HTMLAnchorElement>) {
    if (
      event.defaultPrevented ||
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    ) {
      return
    }

    const root = document.documentElement
    root.style.setProperty('--post-cover-transition-name', coverTransitionName)
    root.style.setProperty('--post-title-transition-name', titleTransitionName)
  }

  return (
    <Link
      href={href}
      prefetch={true}
      transitionTypes={['page-forward']}
      className={className}
      onClick={prepareFallbackMorph}
    >
      {children}
    </Link>
  )
}
