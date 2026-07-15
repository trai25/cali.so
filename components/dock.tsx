'use client'

import Image from 'next/image'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useLayoutEffect, useRef } from 'react'

import {
  PhotosIcon,
  PreferencesIcon,
  ProjectsIcon,
  WritingIcon,
} from '~/components/dock-icons'
import { LiquidGlass } from '~/components/liquid-glass'
import { Preferences } from '~/components/preferences'
import { T } from '~/lib/i18n'
import { localize, useLocale } from '~/lib/locale-client'
import {
  localePath,
  type Locale,
  unlocalizedPathname,
} from '~/lib/locale-route'
import { playDockSound } from '~/lib/sound'

const ITEMS = [
  { href: '/blog', zh: '写作', en: 'Writing', icon: WritingIcon },
  { href: '/photos', zh: '照片', en: 'Photos', icon: PhotosIcon },
  { href: '/projects', zh: '项目', en: 'Projects', icon: ProjectsIcon },
] as const

function DockItem({
  href,
  locale,
  zh,
  en,
  active = false,
  itemRef,
  onNavigate,
  children,
}: {
  href: string
  locale: Locale
  zh: string
  en: string
  active?: boolean
  itemRef?: (element: HTMLAnchorElement | null) => void
  onNavigate?: (href: string, keyboardInitiated: boolean) => void
  children: React.ReactNode
}) {
  return (
    <Link
      ref={itemRef}
      href={href}
      className="dock-item"
      data-active={active || undefined}
      aria-label={localize(locale, zh, en)}
      aria-current={active ? 'page' : undefined}
      onClick={
        onNavigate
          ? (event) => {
              if (!event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey) {
                onNavigate(href, event.detail === 0)
                if (!active) playDockSound()
              }
            }
          : undefined
      }
    >
      {children}
      <span className="dock-tip" aria-hidden>
        <T zh={zh} en={en} />
      </span>
    </Link>
  )
}

export function DockFallback({ locale }: { locale: Locale }) {
  return (
    <nav
      className="dock"
      aria-label={localize(locale, '主导航', 'Main navigation')}
      aria-busy="true"
    >
      <LiquidGlass />
      <DockItem href={localePath(locale, '/')} locale={locale} zh="首页" en="Home">
        <span className="dock-avatar">
          <Image src="/images/avatar.png" alt="" width={26} height={26} />
        </span>
      </DockItem>
      <span className="dock-rule" aria-hidden />
      {ITEMS.map(({ href, zh, en, icon: Icon }) => (
        <DockItem
          key={href}
          href={localePath(locale, href)}
          locale={locale}
          zh={zh}
          en={en}
        >
          <Icon />
        </DockItem>
      ))}
      <span className="dock-rule" aria-hidden />
      <button
        type="button"
        className="dock-item"
        aria-label={localize(locale, '偏好设置加载中', 'Loading preferences')}
        disabled
      >
        <PreferencesIcon />
        <span className="dock-tip" aria-hidden>
          <T zh="偏好" en="Preferences" />
        </span>
      </button>
    </nav>
  )
}

// The global pill dock, bottom center — the avatar is home, everything
// else an icon. Circles inside a pill keep the radii concentric by
// construction.
export function Dock() {
  const locale = useLocale()
  const pathname = usePathname()
  const routePathname = unlocalizedPathname(pathname)
  const activeHref = routePathname === '/' ? '/' : ITEMS.find(({ href }) => routePathname.startsWith(href))?.href
  const dockRef = useRef<HTMLElement | null>(null)
  const indicatorRef = useRef<HTMLSpanElement | null>(null)
  const itemRefs = useRef(new Map<string, HTMLAnchorElement>())
  const activeHrefRef = useRef(activeHref)
  const keyboardNavigationRef = useRef(false)
  const indicatorFrameRef = useRef<number | null>(null)

  function registerItem(href: string, element: HTMLAnchorElement | null) {
    if (element) itemRefs.current.set(href, element)
    else itemRefs.current.delete(href)
  }

  function clearIndicatorFrame() {
    if (indicatorFrameRef.current === null) return
    window.cancelAnimationFrame(indicatorFrameRef.current)
    indicatorFrameRef.current = null
  }

  function positionIndicator(instant: boolean) {
    const dock = dockRef.current
    const indicator = indicatorRef.current
    const href = activeHrefRef.current
    const activeItem = href ? itemRefs.current.get(href) : undefined

    if (!dock || !indicator || !activeItem) {
      indicator?.removeAttribute('data-ready')
      return
    }

    const dockRect = dock.getBoundingClientRect()
    const itemRect = activeItem.getBoundingClientRect()
    const center = itemRect.left - dockRect.left + itemRect.width / 2
    const shouldSnap = instant || !indicator.hasAttribute('data-ready')

    clearIndicatorFrame()
    if (shouldSnap) indicator.setAttribute('data-instant', '')

    indicator.style.setProperty('--dock-indicator-x', `${center}px`)
    indicator.setAttribute('data-ready', '')

    if (shouldSnap) {
      // Keep transitions disabled for one painted frame. Keyboard navigation
      // and dock resizing should reposition the marker without movement.
      indicatorFrameRef.current = window.requestAnimationFrame(() => {
        indicatorFrameRef.current = window.requestAnimationFrame(() => {
          indicatorFrameRef.current = null
          indicator.removeAttribute('data-instant')
        })
      })
    }
  }

  function handleNavigate(href: string, keyboardInitiated: boolean) {
    keyboardNavigationRef.current = href !== activeHref && keyboardInitiated
  }

  useLayoutEffect(() => {
    activeHrefRef.current = activeHref
    positionIndicator(keyboardNavigationRef.current)
    keyboardNavigationRef.current = false
  }, [activeHref])

  useLayoutEffect(() => {
    const dock = dockRef.current
    if (!dock || typeof ResizeObserver === 'undefined') return

    const observer = new ResizeObserver(() => positionIndicator(true))
    observer.observe(dock)

    return () => observer.disconnect()
  }, [])

  useLayoutEffect(() => () => clearIndicatorFrame(), [])

  return (
    <nav ref={dockRef} className="dock" aria-label={localize(locale, '主导航', 'Main navigation')}>
      <LiquidGlass />
      <span ref={indicatorRef} className="dock-active-indicator" aria-hidden />
      <DockItem
        href={localePath(locale, '/')}
        locale={locale}
        zh="首页"
        en="Home"
        active={routePathname === '/'}
        itemRef={(element) => registerItem('/', element)}
        onNavigate={handleNavigate}
      >
        <span className="dock-avatar">
          <Image src="/images/avatar.png" alt="" width={26} height={26} />
        </span>
      </DockItem>
      <span className="dock-rule" aria-hidden />
      {ITEMS.map(({ href, zh, en, icon: Icon }) => (
        <DockItem
          key={href}
          href={localePath(locale, href)}
          locale={locale}
          zh={zh}
          en={en}
          active={routePathname.startsWith(href)}
          itemRef={(element) => registerItem(href, element)}
          onNavigate={handleNavigate}
        >
          <Icon />
        </DockItem>
      ))}
      <span className="dock-rule" aria-hidden />
      <Preferences />
    </nav>
  )
}
