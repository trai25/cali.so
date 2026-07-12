'use client'

import { Menu } from '@base-ui/react/menu'
import { AnimatePresence, motion } from 'framer-motion'
import { Mail } from 'lucide-react'
import { useRef, useState } from 'react'

import { SayHiIcon } from '~/components/dock-icons'
import {
  GitHubCardBody,
  GLYPHS,
  TelegramCardBody,
  XCardBody,
  YouTubeCardBody,
} from '~/components/social-cards'
import { DropdownContent, DropdownMenu, DropdownTrigger } from '~/components/ui/dropdown'
import { T } from '~/lib/i18n'
import { cn } from '~/lib/utils'
import type { IconComponentProps } from '~/lib/icon-map'
import { playTick } from '~/lib/sound'
import { spring } from '~/lib/springs'

import github from '~/content/github.json'
import social from '~/content/social.json'

// 打招呼 — every way to reach Cali, one dock item: a horizontal row of
// icon-only contacts. One shared hover card floats above the row and
// MORPHS between services — position and size spring together (framer
// layout projection) while the contents crossfade — so switching targets
// reads as the same card gliding over, never two cards at once.
function glyphIcon(service: keyof typeof GLYPHS) {
  const { path, color } = GLYPHS[service]
  return function ServiceGlyph({ size = 16, className }: IconComponentProps) {
    return (
      <svg
        viewBox="0 0 24 24"
        width={size}
        height={size}
        className={className}
        style={color ? { color } : undefined}
        aria-hidden
      >
        <path fill="currentColor" d={path} />
      </svg>
    )
  }
}

const CONTACTS: {
  label: string
  href: string
  icon: React.ComponentType<IconComponentProps>
  card?: React.ReactNode
  cardClass?: string
}[] = [
  {
    label: 'X/Twitter',
    href: `https://x.com/${social.x.handle}`,
    icon: glyphIcon('x'),
    card: <XCardBody data={social.x} />,
  },
  {
    label: 'Telegram',
    href: `https://t.me/${social.telegram.handle}`,
    icon: glyphIcon('telegram'),
    card: <TelegramCardBody data={social.telegram} />,
  },
  {
    label: 'YouTube',
    href: `https://youtube.com/@${social.youtube.handle}`,
    icon: glyphIcon('youtube'),
    card: <YouTubeCardBody data={social.youtube} />,
  },
  {
    label: 'GitHub',
    href: `https://github.com/${github.user}`,
    icon: glyphIcon('github'),
    card: <GitHubCardBody data={github} />,
    cardClass: 'service-card-gh',
  },
  { label: 'Email', href: 'mailto:hi@cali.so', icon: Mail },
]

const OPEN_DELAY = 250
const CLOSE_DELAY = 140

// Lives inside DropdownContent so closing the menu unmounts it and resets
// the hovered state for the next open.
function ContactRow() {
  const [hovered, setHovered] = useState<number | null>(null)
  const [center, setCenter] = useState(0)
  const openTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const cancelTimers = () => {
    if (openTimer.current) clearTimeout(openTimer.current)
    if (closeTimer.current) clearTimeout(closeTimer.current)
  }

  const enter = (index: number, el: HTMLElement) => {
    cancelTimers()
    const at = el.offsetLeft + el.offsetWidth / 2
    if (!CONTACTS[index].card) {
      // no card for this one (email) — let any open card slip away
      closeTimer.current = setTimeout(() => setHovered(null), CLOSE_DELAY)
      return
    }
    if (hovered !== null) {
      // already open: glide over immediately
      setCenter(at)
      setHovered(index)
    } else {
      openTimer.current = setTimeout(() => {
        setCenter(at)
        setHovered(index)
      }, OPEN_DELAY)
    }
  }

  const scheduleClose = () => {
    cancelTimers()
    closeTimer.current = setTimeout(() => setHovered(null), CLOSE_DELAY)
  }

  const active = hovered !== null ? CONTACTS[hovered] : null

  return (
    <>
      <AnimatePresence>
        {active?.card && (
          <motion.div
            className={cn('say-hi-card link-card service-card', active.cardClass)}
            layout
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 6 }}
            transition={spring.slow}
            style={{ left: center, translate: '-50%' }}
            onPointerEnter={cancelTimers}
            onPointerLeave={scheduleClose}
          >
            <AnimatePresence mode="popLayout" initial={false}>
              <motion.div
                key={hovered}
                className="say-hi-card-body"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.12 }}
              >
                {active.card}
              </motion.div>
            </AnimatePresence>
          </motion.div>
        )}
      </AnimatePresence>
      {CONTACTS.map(({ label, href, icon: Icon }, index) => (
        <Menu.Item
          key={label}
          // typeahead text for the icon-only rows; Enter/Space synthesizes a
          // click on the anchor, so keyboard activation follows the href too
          label={label}
          onClick={() => playTick()}
          render={
            <a
              href={href}
              target={href.startsWith('mailto:') ? undefined : '_blank'}
              rel={href.startsWith('mailto:') ? undefined : 'noreferrer'}
              className="dock-item focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--focus-ring)]"
              aria-label={label}
              onPointerEnter={(e) => enter(index, e.currentTarget)}
              onPointerLeave={scheduleClose}
              onFocus={(e) => enter(index, e.currentTarget)}
              onBlur={scheduleClose}
            />
          }
        >
          <Icon size={18} strokeWidth={1.5} />
        </Menu.Item>
      ))}
    </>
  )
}

export function SayHi() {
  return (
    // horizontal: the icon row reads left-to-right, so arrow keys and
    // aria-orientation should too
    <DropdownMenu orientation="horizontal">
      <DropdownTrigger
        render={
          <button type="button" className="dock-item" aria-label="打个招呼 / Say hi">
            <SayHiIcon />
            <span className="dock-tip" aria-hidden>
              <T zh="打招呼" en="Say hi" />
            </span>
          </button>
        }
      />
      <DropdownContent
        side="top"
        sideOffset={14}
        className="w-max flex-row items-center gap-1 overflow-visible p-1.5"
      >
        <ContactRow />
      </DropdownContent>
    </DropdownMenu>
  )
}
