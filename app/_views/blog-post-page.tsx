import { MDXRemote } from 'next-mdx-remote/rsc'
import { cacheLife } from 'next/cache'
import { notFound } from 'next/navigation'
import { Suspense } from 'react'
import rehypePrettyCode from 'rehype-pretty-code'
import rehypeSlug from 'rehype-slug'
import remarkGfm from 'remark-gfm'

import { BrailleDate } from '~/components/braille-date'
import { mdxComponents } from '~/components/mdx/mdx-components'
import { PolaroidCover } from '~/components/polaroid-cover'
import { PostToc } from '~/components/post-toc'
import { RevealScope } from '~/components/reveal-scope'
import {
  buildPostRail,
  getAllPosts,
  getPost,
  isPostSlug,
  POST_ARTICLE_START_ID,
} from '~/lib/content'
import { LocalDate, T } from '~/lib/i18n'
import { localeMetadata } from '~/lib/locale-metadata'
import type { Locale } from '~/lib/locale-route'
import rehypePrefixIds from '~/lib/rehype-prefix-ids'
import { postViewTransitionName } from '~/lib/view-transition-name'

export function generatePostStaticParams() {
  return getAllPosts().map((post) => ({ slug: post.slug }))
}

export function requirePostSlug(slug: string) {
  if (!isPostSlug(slug)) notFound()
  return slug
}

export function blogPostMetadata(locale: Locale, slug: string) {
  const post = getPost(requirePostSlug(slug))

  return localeMetadata({
    locale,
    path: `/blog/${post.slug}`,
    title: locale === 'en' ? post.titleEn : post.title,
    description:
      locale === 'en' ? post.descriptionEn : (post.description ?? post.title),
    type: 'article',
  })
}

export function BlogPostRoute({
  locale,
  params,
}: {
  locale: Locale
  params: Promise<{ slug: string }>
}) {
  return (
    <Suspense fallback={<BlogPostLoadingShell locale={locale} />}>
      <BlogPostRouteContent locale={locale} params={params} />
    </Suspense>
  )
}

async function BlogPostRouteContent({
  locale,
  params,
}: {
  locale: Locale
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  return <BlogPostPageView slug={slug} locale={locale} />
}

function BlogPostLoadingShell({ locale }: { locale: Locale }) {
  const label = locale === 'en' ? 'Loading article' : '正在加载文章'

  return (
    <article
      aria-busy="true"
      className="post-article mx-auto min-h-[calc(100svh-3.5rem)] w-full max-w-[37.5rem] px-6"
    >
      <div role="status" aria-label={label}>
        <span className="sr-only">{label}</span>
        <div aria-hidden className="polaroid">
          <div className="polaroid-photo aspect-video bg-muted/40" />
          <div className="polaroid-caption">
            <span className="h-2 w-24 bg-muted/50" />
          </div>
        </div>
        <div aria-hidden className="mt-10 h-24 space-y-3">
          <div className="h-7 w-4/5 bg-muted/60" />
          <div className="h-3 w-32 bg-muted/45" />
        </div>
        <div aria-hidden className="mt-10 space-y-3">
          <div className="h-3 w-full bg-muted/35" />
          <div className="h-3 w-11/12 bg-muted/35" />
          <div className="h-3 w-3/4 bg-muted/35" />
        </div>
      </div>
    </article>
  )
}

async function CachedPostBody({
  locale,
  slug,
}: {
  locale: Locale
  slug: string
}) {
  'use cache'
  cacheLife('max')

  const post = getPost(slug)
  const source = locale === 'en' ? post.bodyEn : post.body

  const prefixIdsPlugin: [typeof rehypePrefixIds, { prefix: string }] = [
    rehypePrefixIds,
    { prefix: 'en-' },
  ]
  const prettyCodePlugin: [
    typeof rehypePrettyCode,
    { theme: { light: string; dark: string } },
  ] = [
    rehypePrettyCode,
    { theme: { light: 'github-light-default', dark: 'github-dark-default' } },
  ]
  const rehypePlugins =
    locale === 'en'
      ? [rehypeSlug, prefixIdsPlugin, prettyCodePlugin]
      : [rehypeSlug, prettyCodePlugin]

  return (
    <MDXRemote
      source={source}
      components={mdxComponents(slug, locale)}
      options={{
        mdxOptions: {
          remarkPlugins: [remarkGfm],
          rehypePlugins,
        },
      }}
    />
  )
}

export async function BlogPostPageView({ slug, locale }: { slug: string; locale: Locale }) {
  const post = getPost(requirePostSlug(slug))
  const rail = buildPostRail(post.title, post.body)
  const railEn = buildPostRail(post.titleEn, post.bodyEn, 'en-')
  const english = locale === 'en'

  return (
    <>
      <PostToc nodes={rail} nodesEn={railEn} />
      <article className="post-article mx-auto w-full max-w-[37.5rem] px-6">
        <header>
          {post.cover && (
            <PolaroidCover
              slug={post.slug}
              cover={post.cover}
              caption={post.cover.caption ?? <BrailleDate date={post.publishedAt} />}
              alt=""
              priority
              morph
              print="collage"
              sizes="(max-width: 704px) 100vw, 656px"
            />
          )}
          <div className="post-title-card">
            <h1
              id={POST_ARTICLE_START_ID}
              className="mt-10 text-2xl font-semibold tracking-tight text-balance"
              style={{ viewTransitionName: postViewTransitionName('title', post.slug) } as React.CSSProperties}
            >
              <T zh={post.title} en={post.titleEn} />
            </h1>
            <p className="post-title-meta mt-3 text-sm text-muted-foreground tabular-nums">
              <time dateTime={post.publishedAt.toISOString()}>
                <LocalDate date={post.publishedAt} />
              </time>
              <span aria-hidden> · </span>
              <T
                zh={`${post.readingMinutes} 分钟阅读`}
                en={`${post.readingMinutesEn} min read`}
              />
            </p>
          </div>
        </header>
        <RevealScope lang={english ? 'en' : 'zh-CN'} className="post-body-stage prose enter mt-10">
          <CachedPostBody slug={post.slug} locale={locale} />
        </RevealScope>
      </article>
    </>
  )
}
