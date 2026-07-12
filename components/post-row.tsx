import Image from 'next/image'
import Link from 'next/link'

import { DitherVeil } from '~/components/dither-veil'
import type { Post } from '~/lib/content'
import { LocalDate } from '~/lib/i18n'

// The one-line post row: dithered print thumb · title · dotted leader ·
// date. The thumb and title stay shared morph elements into the post.
export function PostRow({
  post,
  headingLevel = 'h2',
}: {
  post: Post
  headingLevel?: 'h2' | 'h3'
}) {
  const Heading = headingLevel
  return (
    <Link href={`/blog/${post.slug}`} className="group blog-row hairline-top">
      {post.cover ? (
        <span
          className="print-thumb"
          aria-hidden
          style={{ viewTransitionName: `cover-${post.slug}` } as React.CSSProperties}
        >
          <Image src={post.cover.src} alt="" width={64} height={44} sizes="64px" className="print-thumb-img" />
          <DitherVeil src={post.cover.src} />
        </span>
      ) : (
        <span className="print-thumb print-thumb-empty" aria-hidden />
      )}
      <Heading
        className="blog-row-title"
        style={{ viewTransitionName: `title-${post.slug}` } as React.CSSProperties}
      >
        {post.title}
      </Heading>
      <span className="blog-row-leader" aria-hidden />
      <time
        dateTime={post.publishedAt.toISOString()}
        className="shrink-0 text-muted-foreground tabular-nums"
      >
        <LocalDate date={post.publishedAt} />
      </time>
    </Link>
  )
}
