import type { Metadata } from 'next'
import Link from 'next/link'
import { MDXRemote } from 'next-mdx-remote/rsc'
import rehypePrettyCode from 'rehype-pretty-code'
import rehypeSlug from 'rehype-slug'
import remarkGfm from 'remark-gfm'

import { BrailleDate } from '~/components/braille-date'
import { mdxComponents } from '~/components/mdx/mdx-components'
import { PolaroidCover } from '~/components/polaroid-cover'
import { RevealScope } from '~/components/reveal-scope'
import { PostToc } from '~/components/post-toc'
import { extractHeadings, getAllPosts, getPost } from '~/lib/content'
import { LocalDate, T } from '~/lib/i18n'

export function generateStaticParams() {
  return getAllPosts().map((post) => ({ slug: post.slug }))
}

export const dynamicParams = false

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>
}): Promise<Metadata> {
  const post = getPost((await params).slug)
  return {
    title: post.title,
    description: post.description,
    openGraph: { title: post.title, description: post.description, type: 'article' },
  }
}

export default async function BlogPostPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const post = getPost((await params).slug)
  const headings = extractHeadings(post.body)

  return (
    <article lang="zh-CN" className="mx-auto w-full max-w-[37.5rem] px-6">
      <PostToc headings={headings} title={post.title} />
      <Link href="/blog" className="back-pill enter" aria-label="返回写作 / Back to writing">
        <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden>
          <path
            d="M10 3.5 5.5 8 10 12.5"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </Link>
      <header>
        {post.cover && (
          <PolaroidCover
            slug={post.slug}
            cover={post.cover}
            caption={post.cover.caption ?? <BrailleDate date={post.publishedAt} />}
            alt={post.title}
            priority
            morph
            print="collage"
            sizes="(max-width: 704px) 100vw, 656px"
          />
        )}
        <h1
          className="mt-10 text-2xl font-semibold tracking-tight text-balance"
          style={{ viewTransitionName: `title-${post.slug}` } as React.CSSProperties}
        >
          {post.title}
        </h1>
        <p
          className="enter mt-3 text-sm text-muted-foreground tabular-nums"
          style={{ '--enter-delay': '120ms' } as React.CSSProperties}
        >
          <time dateTime={post.publishedAt.toISOString()}>
            <LocalDate date={post.publishedAt} />
          </time>
          <span aria-hidden> · </span>
          <T zh={`${post.readingMinutes} 分钟阅读`} en={`${post.readingMinutes} min read`} />
        </p>
      </header>
      <RevealScope className="prose enter mt-10">
        <MDXRemote
          source={post.body}
          components={mdxComponents(post.slug)}
          options={{
            mdxOptions: {
              remarkPlugins: [remarkGfm],
              rehypePlugins: [
                rehypeSlug,
                [
                  rehypePrettyCode,
                  { theme: { light: 'github-light-default', dark: 'github-dark-default' } },
                ],
              ],
            },
          }}
        />
      </RevealScope>
    </article>
  )
}
