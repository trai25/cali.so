import type { Post } from './content'
import type { Locale } from './locale-route'
import type { ArchivedNewsletter } from './newsletters'

export const ogImageSize = { width: 1200, height: 630 } as const

function imageMetadata(id: string, title: string) {
  return [
    {
      id,
      alt: `${title} · Cali Castle`,
      size: ogImageSize,
      contentType: 'image/png',
    },
  ]
}

export function postOgImageMetadata(
  post: Pick<Post, 'slug' | 'title' | 'titleEn'>,
  locale: Locale,
) {
  return imageMetadata(
    post.slug,
    locale === 'en' ? post.titleEn : post.title,
  )
}

export function newsletterOgImageMetadata(
  newsletter: Pick<ArchivedNewsletter, 'id' | 'title' | 'titleEn'>,
  locale: Locale,
) {
  return imageMetadata(
    newsletter.id,
    locale === 'en' ? newsletter.titleEn : newsletter.title,
  )
}
