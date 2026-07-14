import Link from 'next/link'
import type { Metadata } from 'next'

import { T } from '~/lib/i18n'
import { localeRoutePair } from '~/lib/locale-metadata'
import { localePath, type Locale } from '~/lib/locale-route'

export function newsletterRetiredMetadata(locale: Locale): Metadata {
  const title =
    locale === 'en'
      ? 'Newsletter confirmation retired'
      : 'Newsletter 确认链接已停用'
  const description =
    locale === 'en'
      ? 'Legacy newsletter confirmation links no longer process subscriber information.'
      : '旧 Newsletter 确认链接不再处理订阅信息。'
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
    robots: { index: false, follow: false },
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
        <p className="font-mono text-[0.6875rem] tracking-[0.16em] text-muted-foreground">
          CONFIRMATION_RETIRED
        </p>
        <h1
          id="newsletter-retired-title"
          className="mt-4 text-xl font-semibold tracking-tight"
        >
          <T
            zh="Newsletter 确认链接已停用"
            en="Newsletter confirmation is retired"
          />
        </h1>
        <p className="mt-3 max-w-[32rem] text-sm leading-relaxed text-muted-foreground">
          <T
            zh="这个旧链接不会再读取或更新任何订阅信息。Newsletter 服务已经停止，你仍然可以通过 RSS 阅读网站更新。"
            en="This old link no longer reads or updates subscriber information. The newsletter service has ended, but site updates remain available through RSS."
          />
        </p>
        <nav
          className="mt-6 flex flex-wrap gap-x-6 gap-y-3 text-sm"
          aria-label="Newsletter options"
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
