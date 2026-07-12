'use client'

import Image from 'next/image'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

import { PhotosIcon, ProjectsIcon, WritingIcon } from '~/components/dock-icons'
import { LiquidGlass } from '~/components/liquid-glass'
import { Preferences } from '~/components/preferences'
import { SayHi } from '~/components/say-hi'
import { T } from '~/lib/i18n'
import { playTick } from '~/lib/sound'

const ITEMS = [
  { href: '/blog', zh: '写作', en: 'Writing', icon: WritingIcon },
  { href: '/photos', zh: '照片', en: 'Photos', icon: PhotosIcon },
  { href: '/projects', zh: '项目', en: 'Projects', icon: ProjectsIcon },
] as const

function DockItem({
  href,
  zh,
  en,
  active,
  children,
}: {
  href: string
  zh: string
  en: string
  active: boolean
  children: React.ReactNode
}) {
  return (
    <Link
      href={href}
      className="dock-item"
      data-active={active || undefined}
      aria-label={`${zh} / ${en}`}
      aria-current={active ? 'page' : undefined}
      onClick={() => playTick()}
    >
      {children}
      {active && <span className="dock-dot" aria-hidden />}
      <span className="dock-tip" aria-hidden>
        <T zh={zh} en={en} />
      </span>
    </Link>
  )
}

// The global pill dock, bottom center — the avatar is home, everything
// else an icon. Circles inside a pill keep the radii concentric by
// construction.
export function Dock() {
  const pathname = usePathname()
  return (
    <nav className="dock" aria-label="主导航 / Main navigation">
      <LiquidGlass />
      <DockItem href="/" zh="首页" en="Home" active={pathname === '/'}>
        <span className="dock-avatar">
          <Image src="/images/avatar.png" alt="" width={26} height={26} />
        </span>
      </DockItem>
      <span className="dock-rule" aria-hidden />
      {ITEMS.map(({ href, zh, en, icon: Icon }) => (
        <DockItem key={href} href={href} zh={zh} en={en} active={pathname.startsWith(href)}>
          <Icon />
        </DockItem>
      ))}
      <span className="dock-rule" aria-hidden />
      <SayHi />
      <Preferences />
    </nav>
  )
}
