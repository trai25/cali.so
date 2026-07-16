import { notFound } from 'next/navigation'

import { createNewsletterOgImage } from '~/lib/og-image'
import { newsletterOgImageMetadata } from '~/lib/og-image-metadata'
import {
  archivedNewsletterIds,
  getArchivedNewsletter,
  isArchivedNewsletterId,
} from '~/lib/newsletters'

export function generateStaticParams() {
  return archivedNewsletterIds.map((id) => ({ id }))
}

export function generateImageMetadata({ params }: { params: { id: string } }) {
  if (!isArchivedNewsletterId(params.id)) return []
  return newsletterOgImageMetadata(getArchivedNewsletter(params.id), 'zh')
}

export default async function OpengraphImage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  if (!isArchivedNewsletterId(id)) notFound()
  return createNewsletterOgImage(getArchivedNewsletter(id), 'zh')
}
