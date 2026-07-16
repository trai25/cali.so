import { notFound } from 'next/navigation'

import { createNewsletterOgImage } from '~/lib/og-image'
import {
  archivedNewsletterIds,
  getArchivedNewsletter,
  isArchivedNewsletterId,
} from '~/lib/newsletters'

export function generateStaticParams() {
  return archivedNewsletterIds.map((id) => ({ id }))
}

const size = { width: 1200, height: 630 }

export function generateImageMetadata({ params }: { params: { id: string } }) {
  if (!isArchivedNewsletterId(params.id)) return []
  const newsletter = getArchivedNewsletter(params.id)
  return [
    {
      id: params.id,
      alt: `${newsletter.title} · Cali Castle`,
      size,
      contentType: 'image/png',
    },
  ]
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
