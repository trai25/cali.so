import { notFound } from 'next/navigation'

import {
  newsletterArchiveMetadata,
  NewsletterArchivePageView,
} from '../../../_views/newsletter-archive-page'
import {
  archivedNewsletterIds,
  isArchivedNewsletterId,
} from '~/lib/newsletters'

// TODO: Cache Components adoption. Refactor this route so this opt-out can be removed.
// See: https://nextjs.org/docs/app/guides/migrating-to-cache-components
export const instant = false

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
  return newsletterArchiveMetadata('zh', id)
}

export default async function ChineseNewsletterArchivePage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  if (!isArchivedNewsletterId(id)) notFound()
  return <NewsletterArchivePageView id={id} locale="zh" />
}
