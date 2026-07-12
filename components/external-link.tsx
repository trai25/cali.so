'use client'

import { PreviewCard } from '@base-ui/react/preview-card'

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
  const icon = (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={favicon} alt="" width={14} height={14} loading="lazy" aria-hidden />
  )

  if (!preview?.title) {
    return (
      <a href={href} target="_blank" rel="noreferrer" className="external-link">
        {icon}
        {children}
      </a>
    )
  }

  return (
    <PreviewCard.Root>
      {/* Base UI's trigger renders the <a> itself; delays live here, not on
          the root (Base UI defaults are 600/300 — far too slow for prose) */}
      <PreviewCard.Trigger
        href={href}
        target="_blank"
        rel="noreferrer"
        className="external-link"
        delay={300}
        closeDelay={100}
      >
        {icon}
        {children}
      </PreviewCard.Trigger>
      <PreviewCard.Portal>
        <PreviewCard.Positioner sideOffset={8} collisionPadding={16} className="pointer-events-none z-[var(--z-card)]">
          <PreviewCard.Popup className="link-card">
            <span className="link-card-site">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={favicon} alt="" width={16} height={16} loading="lazy" aria-hidden />
              {preview.domain}
            </span>
            <span className="link-card-title">{preview.title}</span>
            {preview.description && <span className="link-card-description">{preview.description}</span>}
          </PreviewCard.Popup>
        </PreviewCard.Positioner>
      </PreviewCard.Portal>
    </PreviewCard.Root>
  )
}
