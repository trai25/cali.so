import { notFound } from 'next/navigation'

import {
  newsletterArchiveMetadata,
  NewsletterArchivePageView,
} from '../../../../_views/newsletter-archive-page'
import {
  archivedNewsletterIds,
  isArchivedNewsletterId,
} from '~/lib/newsletters'

export function generateStaticParams() {
  return archivedNewsletterIds.map((id) => ({ id }))
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  if (!isArchivedNewsletterId(id)) notFound()
  return newsletterArchiveMetadata('en', id)
}

export default async function EnglishNewsletterArchivePage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  if (!isArchivedNewsletterId(id)) notFound()
  return <NewsletterArchivePageView id={id} locale="en" />
}
