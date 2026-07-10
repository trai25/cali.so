import type { Metadata } from 'next'
import Link from 'next/link'

import { PolaroidCover } from '~/components/polaroid-cover'
import { getAllPosts } from '~/lib/content'
import { formatDate } from '~/lib/date'

export const metadata: Metadata = {
  title: '写作',
  description: 'Cali 的博客文章',
}

export default function BlogIndexPage() {
  const posts = getAllPosts()

  return (
    <div className="mx-auto w-full max-w-2xl px-6">
      <h1 className="text-2xl font-semibold tracking-tight text-balance">写作</h1>
      <ul className="mt-10 flex flex-col gap-12">
        {posts.map((post, index) => (
          <li key={post.slug}>
            <Link href={`/blog/${post.slug}`} className="group block">
              {post.cover && (
                <PolaroidCover
                  slug={post.slug}
                  cover={post.cover}
                  caption={formatDate(post.publishedAt)}
                  tilted
                  priority={index === 0}
                  sizes="(max-width: 704px) 100vw, 656px"
                  className="max-w-sm"
                />
              )}
              <div className="mt-5 flex items-baseline justify-between gap-4">
                <h2 className="font-medium">{post.title}</h2>
                <time
                  dateTime={post.publishedAt.toISOString()}
                  className="shrink-0 text-sm text-muted-foreground tabular-nums"
                >
                  {formatDate(post.publishedAt)}
                </time>
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}
