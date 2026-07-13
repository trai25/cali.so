'use client'

import { PreviewCard } from '@base-ui/react/preview-card'

import { ExternalLabel } from '~/components/external-mark'
import type { LinkPreview } from '~/lib/link-previews'
import { useLocale } from '~/lib/locale-client'

const HAN = /\p{Script=Han}/u

function englishOrSource(english: string | undefined, source: string | undefined) {
  if (english) return english
  return source && !HAN.test(source) ? source : undefined
}

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
  const locale = useLocale()
  const title = locale === 'en' ? englishOrSource(preview?.titleEn, preview?.title) : preview?.title
  const description =
    locale === 'en'
      ? englishOrSource(preview?.descriptionEn, preview?.description)
      : preview?.description
  const domain = preview?.domain
  const icon = (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={favicon} alt="" width={14} height={14} loading="lazy" aria-hidden />
  )

  if (!title || !domain) {
    return (
      <a href={href} target="_blank" rel="noreferrer" className="external-link">
        {icon}
        <ExternalLabel>{children}</ExternalLabel>
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
        <ExternalLabel>{children}</ExternalLabel>
      </PreviewCard.Trigger>
      <PreviewCard.Portal>
        <PreviewCard.Positioner sideOffset={8} collisionPadding={16} className="pointer-events-none z-[var(--z-card)]">
          <PreviewCard.Popup className="link-card">
            <span className="link-card-site">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={favicon} alt="" width={16} height={16} loading="lazy" aria-hidden />
              {domain}
            </span>
            <span className="link-card-title">{title}</span>
            {description && <span className="link-card-description">{description}</span>}
          </PreviewCard.Popup>
        </PreviewCard.Positioner>
      </PreviewCard.Portal>
    </PreviewCard.Root>
  )
}
