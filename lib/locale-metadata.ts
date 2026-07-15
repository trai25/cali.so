import type { Metadata } from 'next'

import type { Locale } from './locale-route'
import { localePath } from './locale-route'
import { seo } from './seo'

interface LocaleMetadataOptions {
  locale: Locale
  path: string
  title: string
  description: string
  type?: 'article' | 'website'
}

export function localeRoutePair(path: string) {
  const zh = new URL(localePath('zh', path), seo.url)
  const en = new URL(localePath('en', path), seo.url)

  return {
    zh,
    en,
    languages: {
      'zh-CN': zh.href,
      en: en.href,
      'x-default': zh.href,
    },
  }
}

/** Build server-rendered metadata for one side of a Chinese/English route pair. */
export function localeMetadata({
  locale,
  path,
  title,
  description,
  type = 'website',
}: LocaleMetadataOptions): Metadata {
  const pair = localeRoutePair(path)
  const canonical = locale === 'en' ? pair.en : pair.zh

  return {
    title,
    description,
    alternates: {
      canonical,
      languages: pair.languages,
    },
    openGraph: {
      title,
      description,
      type,
      locale: locale === 'en' ? 'en_US' : 'zh_CN',
      siteName: 'Cali Castle',
      url: canonical,
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
    },
  }
}
