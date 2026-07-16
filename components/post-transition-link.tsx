'use client'

import Link from 'next/link'
import { useRef, type MouseEvent, type ReactNode } from 'react'

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
  const pointerNavigationRef = useRef(false)

  function recordInputModality(event: MouseEvent<HTMLAnchorElement>) {
    pointerNavigationRef.current = event.detail !== 0
  }

  function prepareFallbackMorph() {
    const root = document.documentElement
    if (!pointerNavigationRef.current) {
      root.style.removeProperty('--post-cover-transition-name')
      root.style.removeProperty('--post-title-transition-name')
      return
    }

    root.style.setProperty('--post-cover-transition-name', coverTransitionName)
    root.style.setProperty('--post-title-transition-name', titleTransitionName)
  }

  return (
    <Link
      href={href}
      prefetch={true}
      className={className}
      onClick={recordInputModality}
      onNavigate={prepareFallbackMorph}
    >
      {children}
    </Link>
  )
}
