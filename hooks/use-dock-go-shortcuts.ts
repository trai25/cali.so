'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useRef } from 'react'

import { localePath, type Locale } from '~/lib/locale-route'
import { playDockSound } from '~/lib/sound'

const GO_TIMEOUT_MS = 1000

/** G then <key> → unlocalized dock route (GitHub-style). */
export const DOCK_GO_SHORTCUTS: Record<string, string> = {
  h: '/',
  w: '/blog',
  p: '/photos',
  j: '/projects',
  a: '/ama',
}

/** Uppercase second key for an unlocalized dock href, e.g. `/blog` → `"W"`. */
export function dockGoKeyFor(href: string): string | undefined {
  const entry = Object.entries(DOCK_GO_SHORTCUTS).find(([, path]) => path === href)
  return entry?.[0]?.toUpperCase()
}

function isTypingTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false
  const tag = target.tagName
  return (
    tag === 'INPUT' ||
    tag === 'TEXTAREA' ||
    tag === 'SELECT' ||
    target.isContentEditable
  )
}

/**
 * Global chord shortcuts for the dock: press G, then H / W / P / J / A
 * within a short window to jump Home / Writing / Photos / Projects / AMA.
 */
export function useDockGoShortcuts({
  locale,
  activeHref,
  onNavigate,
}: {
  locale: Locale
  activeHref: string | undefined
  onNavigate?: (href: string, keyboardInitiated: boolean) => void
}) {
  const router = useRouter()
  const pendingGoRef = useRef(false)
  const timeoutRef = useRef<number | null>(null)
  const localeRef = useRef(locale)
  const activeHrefRef = useRef(activeHref)
  const onNavigateRef = useRef(onNavigate)

  localeRef.current = locale
  activeHrefRef.current = activeHref
  onNavigateRef.current = onNavigate

  useEffect(() => {
    function clearPending() {
      pendingGoRef.current = false
      if (timeoutRef.current !== null) {
        window.clearTimeout(timeoutRef.current)
        timeoutRef.current = null
      }
    }

    function armGo() {
      pendingGoRef.current = true
      if (timeoutRef.current !== null) window.clearTimeout(timeoutRef.current)
      timeoutRef.current = window.setTimeout(clearPending, GO_TIMEOUT_MS)
    }

    function goTo(unlocalizedHref: string) {
      const localized = localePath(localeRef.current, unlocalizedHref)
      const isActive = activeHrefRef.current === unlocalizedHref
      onNavigateRef.current?.(unlocalizedHref, true)
      if (!isActive) playDockSound()
      router.push(localized)
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.metaKey || event.ctrlKey || event.altKey) {
        clearPending()
        return
      }
      if (event.repeat) return
      if (isTypingTarget(event.target)) {
        clearPending()
        return
      }

      const key = event.key.length === 1 ? event.key.toLowerCase() : event.key

      if (!pendingGoRef.current) {
        if (key === 'g') {
          event.preventDefault()
          armGo()
        }
        return
      }

      if (key === 'Escape') {
        event.preventDefault()
        clearPending()
        return
      }

      if (key === 'g') {
        event.preventDefault()
        armGo()
        return
      }

      const href = DOCK_GO_SHORTCUTS[key]
      clearPending()
      if (!href) return

      event.preventDefault()
      goTo(href)
    }

    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      clearPending()
    }
  }, [router])
}
