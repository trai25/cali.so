import Image from 'next/image'
import { MDXRemote } from 'next-mdx-remote/rsc'
import remarkGfm from 'remark-gfm'

import { RevealScope } from '~/components/reveal-scope'
import { mdxComponents } from '~/components/mdx/mdx-components'
import { T } from '~/lib/i18n'
import { localeMetadata } from '~/lib/locale-metadata'
import type { Locale } from '~/lib/locale-route'
import {
  archivedNewsletterImages,
  getArchivedNewsletter,
  type ArchivedNewsletterId,
} from '~/lib/newsletters'

function NewsletterImage({ src, alt }: { src?: string | Blob; alt?: string }) {
  if (typeof src !== 'string' || !(src in archivedNewsletterImages)) {
    throw new Error(`Unknown newsletter image: ${String(src)}`)
  }

  const dimensions =
    archivedNewsletterImages[src as keyof typeof archivedNewsletterImages]
  const isCover = src.endsWith('/cover.png')
  return (
    <Image
      src={src}
      alt={alt ?? ''}
      width={dimensions.width}
      height={dimensions.height}
      sizes="(max-width: 704px) 100vw, 600px"
      className="newsletter-archive-image"
      loading={isCover ? 'eager' : 'lazy'}
      fetchPriority={isCover ? 'high' : 'auto'}
      unoptimized
    />
  )
}

export function newsletterArchiveMetadata(
  locale: Locale,
  id: ArchivedNewsletterId,
) {
  const newsletter = getArchivedNewsletter(id)
  return localeMetadata({
    locale,
    path: `/newsletters/${id}`,
    title: locale === 'en' ? newsletter.titleEn : newsletter.title,
    description:
      locale === 'en' ? newsletter.descriptionEn : newsletter.description,
    type: 'article',
  })
}

export function NewsletterArchivePageView({
  id,
  locale,
}: {
  id: ArchivedNewsletterId
  locale: Locale
}) {
  const newsletter = getArchivedNewsletter(id)
  const english = locale === 'en'

  return (
    <article className="mx-auto box-border w-full max-w-[37.5rem] px-6">
      <header className="hairline-bottom mb-10 pb-8">
        <p className="font-mono text-sm tracking-[-0.011em] text-muted-foreground">
          <T
            zh={`存档 / ${id.padStart(3, '0')}`}
            en={`ARCHIVE / ${id.padStart(3, '0')}`}
          />
        </p>
        <h1 className="mt-4 text-2xl font-semibold tracking-tight text-balance">
          <T zh={newsletter.title} en={newsletter.titleEn} />
        </h1>
        <p className="mt-3 max-w-[32rem] text-sm leading-relaxed text-muted-foreground">
          <T
            zh="这是原始 Newsletter 的只读存档。订阅、发送和旧账户功能已经停止。"
            en="This is a read-only archive of the original newsletter. Subscriptions, sending and legacy account features are retired."
          />
        </p>
      </header>

      <RevealScope lang={english ? 'en' : 'zh-CN'} className="prose enter">
        <MDXRemote
          source={english ? newsletter.bodyEn : newsletter.body}
          components={{
            ...mdxComponents(`newsletters/${id}`, locale),
            img: NewsletterImage,
          }}
          options={{ mdxOptions: { remarkPlugins: [remarkGfm] } }}
        />
      </RevealScope>
    </article>
  )
}
