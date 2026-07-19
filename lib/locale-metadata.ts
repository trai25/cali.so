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

const SOCIAL_IMAGE_VERSION = process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 12)
const SECTION_IMAGE_PATHS = new Set(['/ama', '/blog', '/photos', '/projects'])

export function socialImageUrl(locale: Locale, path: string) {
  const url = new URL('/og', seo.url)
  url.searchParams.set('locale', locale)
  url.searchParams.set('path', path)
  if (SOCIAL_IMAGE_VERSION) url.searchParams.set('v', SOCIAL_IMAGE_VERSION)
  return url
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
  const sentenceSeparator = locale === 'en' ? '. ' : '。'
  const image = {
    url: socialImageUrl(locale, path),
    width: 1200,
    height: 630,
    alt:
      path === '/'
        ? `${title}${sentenceSeparator}${description}`
        : SECTION_IMAGE_PATHS.has(path)
          ? `${title} · Cali Castle${sentenceSeparator}${description}`
        : `${title} · Cali Castle`,
    type: 'image/png',
  }

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
      images: [image],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [image],
    },
  }
}
