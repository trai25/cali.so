import {
  newsletterRetiredMetadata,
  NewsletterRetiredPageView,
} from '../../../_views/newsletter-retired-page'

export const metadata = newsletterRetiredMetadata('zh')

// TODO: Cache Components adoption. Refactor this route so this opt-out can be removed.
// See: https://nextjs.org/docs/app/guides/migrating-to-cache-components
export const instant = false

// The token parameter is deliberately not accepted or read. This route only
// preserves the old URL shape and cannot query or mutate subscriber data.
export default function ChineseNewsletterRetiredPage() {
  return <NewsletterRetiredPageView locale="zh" />
}
