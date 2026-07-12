'use client'

import * as HoverCard from '@radix-ui/react-hover-card'

import type { LinkPreview } from '~/lib/link-previews'

// External prose links: inline favicon prefix, and — with build-time
// preview data and a fine pointer — a fixed-size hover card. On touch
// the trigger is just a link; the card is an enhancement, never content.
export function ExternalLink({
  href,
  favicon,
  preview,
  children,
}: {
  href: string
  favicon: string
  preview?: LinkPreview
  children: React.ReactNode
}) {
  const anchor = (
    <a href={href} target="_blank" rel="noreferrer" className="external-link">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={favicon} alt="" width={14} height={14} loading="lazy" aria-hidden />
      {children}
    </a>
  )

  if (!preview?.title) return anchor

  return (
    <HoverCard.Root openDelay={300} closeDelay={100}>
      <HoverCard.Trigger asChild>{anchor}</HoverCard.Trigger>
      <HoverCard.Portal>
        <HoverCard.Content className="link-card" sideOffset={8} collisionPadding={16}>
          <span className="link-card-site">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={favicon} alt="" width={16} height={16} loading="lazy" aria-hidden />
            {preview.domain}
          </span>
          <span className="link-card-title">{preview.title}</span>
          {preview.description && <span className="link-card-description">{preview.description}</span>}
        </HoverCard.Content>
      </HoverCard.Portal>
    </HoverCard.Root>
  )
}
