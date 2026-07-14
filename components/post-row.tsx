import Image from 'next/image'
import Link from 'next/link'

import { DitherVeil } from '~/components/dither-veil'
import type { Post } from '~/lib/content'
import { formatMonthDay, formatShortDate } from '~/lib/date'
import { LocalDate, T } from '~/lib/i18n'
import { localePath, type Locale } from '~/lib/locale-route'

// The compact post row: dithered print thumb · title · dotted leader · date.
// Mobile titles may use two lines; thumb and title stay shared morph elements.
export function PostRow({
  post,
  headingLevel = 'h2',
  dateStyle = 'full',
  locale = 'zh',
}: {
  post: Post
  headingLevel?: 'h2' | 'h3'
  dateStyle?: 'full' | 'month-day' | 'short'
  locale?: Locale
}) {
  const Heading = headingLevel
  return (
    <Link href={localePath(locale, `/blog/${post.slug}`)} className="group blog-row hairline-top">
      <span className="print-pile" aria-hidden>
        <span className="print-pile-sheet" />
        <span className="print-pile-sheet" />
        {post.cover ? (
          <span
            className="print-thumb"
            style={{ viewTransitionName: `cover-${post.slug}` } as React.CSSProperties}
          >
            <Image src={post.cover.src} alt="" width={64} height={44} sizes="64px" className="print-thumb-img" />
            <DitherVeil src={post.cover.src} />
          </span>
        ) : (
          <span className="print-thumb print-thumb-empty" />
        )}
      </span>
      <Heading
        className="blog-row-title"
        style={{ viewTransitionName: `title-${post.slug}` } as React.CSSProperties}
      >
        <T zh={post.title} en={post.titleEn} />
      </Heading>
      <span className="blog-row-leader" aria-hidden />
      <time
        dateTime={post.publishedAt.toISOString()}
        className="shrink-0 text-muted-foreground tabular-nums"
      >
        {dateStyle === 'month-day' && formatMonthDay(post.publishedAt)}
        {dateStyle === 'short' && formatShortDate(post.publishedAt)}
        {dateStyle === 'full' && <LocalDate date={post.publishedAt} />}
      </time>
    </Link>
  )
}
