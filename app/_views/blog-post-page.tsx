import { MDXRemote } from 'next-mdx-remote/rsc'
import { cacheLife } from 'next/cache'
import { notFound } from 'next/navigation'
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

async function CachedPostBody({
  locale,
  slug,
  source,
}: {
  locale: Locale
  slug: string
  source: string
}) {
  'use cache'
  cacheLife('max')

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
  const source = english ? post.bodyEn : post.body

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
          <CachedPostBody
            source={source}
            slug={post.slug}
            locale={locale}
          />
        </RevealScope>
      </article>
    </>
  )
}
