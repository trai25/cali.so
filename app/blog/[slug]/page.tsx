import type { Metadata } from 'next'
import { MDXRemote } from 'next-mdx-remote/rsc'
import rehypePrettyCode from 'rehype-pretty-code'
import remarkGfm from 'remark-gfm'

import { mdxComponents } from '~/components/mdx/mdx-components'
import { PolaroidCover } from '~/components/polaroid-cover'
import { getAllPosts, getPost } from '~/lib/content'
import { formatDate } from '~/lib/date'

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

  return (
    <article className="mx-auto w-full max-w-[37.5rem] px-6">
      <header>
        {post.cover && (
          <PolaroidCover
            slug={post.slug}
            cover={post.cover}
            caption={post.cover.caption ?? formatDate(post.publishedAt)}
            priority
            sizes="(max-width: 704px) 100vw, 656px"
          />
        )}
        <h1 className="mt-10 text-2xl font-semibold tracking-tight text-balance">
          {post.title}
        </h1>
        <p className="mt-3 text-sm text-muted-foreground tabular-nums">
          <time dateTime={post.publishedAt.toISOString()}>{formatDate(post.publishedAt)}</time>
          <span aria-hidden> · </span>
          {post.readingMinutes} 分钟阅读
        </p>
      </header>
      <div className="prose mt-10">
        <MDXRemote
          source={post.body}
          components={mdxComponents(post.slug)}
          options={{
            mdxOptions: {
              remarkPlugins: [remarkGfm],
              rehypePlugins: [
                [
                  rehypePrettyCode,
                  { theme: { light: 'github-light-default', dark: 'github-dark-default' } },
                ],
              ],
            },
          }}
        />
      </div>
    </article>
  )
}
