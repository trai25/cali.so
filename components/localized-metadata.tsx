'use client'

import { useEffect } from 'react'

import { localize, useLocale } from '~/lib/locale-client'

export function LocalizedMetadata({
  titleZh,
  titleEn,
  descriptionZh,
  descriptionEn,
}: {
  titleZh: string
  titleEn: string
  descriptionZh: string
  descriptionEn: string
}) {
  const locale = useLocale()

  useEffect(() => {
    const title = localize(locale, titleZh, titleEn)
    const description = localize(locale, descriptionZh, descriptionEn)
    document.title = `${title} | Cali Castle`

    document.querySelector('meta[name="description"]')?.setAttribute('content', description)
    document.querySelector('meta[property="og:title"]')?.setAttribute('content', title)
    document.querySelector('meta[property="og:description"]')?.setAttribute('content', description)
  }, [descriptionEn, descriptionZh, locale, titleEn, titleZh])

  return null
}
