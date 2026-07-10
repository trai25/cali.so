import Image from 'next/image'

import type { PostCover } from '~/lib/content'
import { cn } from '~/lib/utils'

// Deterministic tilt in [-2°, 2°] derived from the slug — stable across
// builds (design language: instant-photo cover treatment).
function tiltFromSlug(slug: string): number {
  let h = 0
  for (let i = 0; i < slug.length; i++) h = (h * 31 + slug.charCodeAt(i)) | 0
  return ((Math.abs(h) % 401) - 200) / 100
}

export function PolaroidCover({
  slug,
  cover,
  caption,
  tilted = false,
  priority = false,
  sizes,
  className,
}: {
  slug: string
  cover: PostCover
  caption?: string
  tilted?: boolean
  priority?: boolean
  sizes?: string
  className?: string
}) {
  return (
    <figure
      className={cn('polaroid', tilted && 'polaroid-tilted', className)}
      style={tilted ? ({ '--tilt': `${tiltFromSlug(slug)}deg` } as React.CSSProperties) : undefined}
    >
      <Image
        src={cover.src}
        alt={caption ?? ''}
        width={cover.width}
        height={cover.height}
        priority={priority}
        sizes={sizes}
        className="w-full"
      />
      <figcaption className="polaroid-caption">{caption ?? cover.caption ?? ' '}</figcaption>
    </figure>
  )
}
