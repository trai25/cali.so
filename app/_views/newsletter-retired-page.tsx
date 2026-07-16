import Link from 'next/link'
import type { Metadata } from 'next'

import { T } from '~/lib/i18n'
import { localeRoutePair } from '~/lib/locale-metadata'
import { localePath, type Locale } from '~/lib/locale-route'
import { nonPublicRobots } from '~/lib/non-public-metadata'

const retiredCopy = {
  zh: {
    title: 'Newsletter 确认链接已停用',
    description:
      '这个旧链接不会再读取或更新任何订阅信息。Newsletter 服务已经停止，你仍然可以通过 RSS 阅读网站更新。',
  },
  en: {
    title: 'Newsletter confirmation is retired',
    description:
      'This old link no longer reads or updates subscriber information. The newsletter service has ended, but site updates remain available through RSS.',
  },
} as const

export function newsletterRetiredMetadata(locale: Locale): Metadata {
  const { title, description } = retiredCopy[locale]
  const pair = localeRoutePair('/confirm/retired')

  return {
    title,
    description,
    alternates: { languages: pair.languages },
    openGraph: {
      title,
      description,
      type: 'website',
      locale: locale === 'en' ? 'en_US' : 'zh_CN',
      siteName: 'Cali Castle',
      url: locale === 'en' ? pair.en : pair.zh,
    },
    twitter: { card: 'summary_large_image', title, description },
    robots: nonPublicRobots,
  }
}

export function NewsletterRetiredPageView({ locale }: { locale: Locale }) {
  const feed = locale === 'en' ? '/feed.en.xml' : '/feed.xml'

  return (
    <div className="mx-auto box-border w-full max-w-[37.5rem] px-6">
      <section
        className="hairline-y py-8"
        aria-labelledby="newsletter-retired-title"
      >
        <p className="font-mono text-sm tracking-[-0.011em] text-muted-foreground">
          <T zh="确认链接已停用" en="CONFIRMATION_RETIRED" />
        </p>
        <h1
          id="newsletter-retired-title"
          className="mt-4 text-sm font-semibold tracking-[-0.011em]"
        >
          <T
            zh={retiredCopy.zh.title}
            en={retiredCopy.en.title}
          />
        </h1>
        <p className="mt-3 max-w-[32rem] text-sm leading-relaxed text-muted-foreground">
          <T
            zh={retiredCopy.zh.description}
            en={retiredCopy.en.description}
          />
        </p>
        <nav
          className="mt-6 flex flex-wrap gap-x-6 gap-y-3 text-sm"
          aria-label={locale === 'en' ? 'Newsletter options' : '电子报选项'}
        >
          <a
            href={feed}
            className="underline decoration-border underline-offset-4 hover:decoration-foreground"
          >
            <T zh="打开 RSS" en="Open RSS" />
          </a>
          <Link
            href={localePath(locale, '/')}
            className="underline decoration-border underline-offset-4 hover:decoration-foreground"
          >
            <T zh="返回首页" en="Return home" />
          </Link>
        </nav>
      </section>
    </div>
  )
}
