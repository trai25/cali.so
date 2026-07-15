import {
  newsletterRetiredMetadata,
  NewsletterRetiredPageView,
} from '../../../_views/newsletter-retired-page'

export const metadata = newsletterRetiredMetadata('zh')

// This unlinked legacy token route intentionally blocks. Its response is
// static and safe, but an arbitrary token cannot produce a reusable route
// shell during prerendering.
export const instant = false

// The token parameter is deliberately not accepted or read. This route only
// preserves the old URL shape and cannot query or mutate subscriber data.
export default function ChineseNewsletterRetiredPage() {
  return <NewsletterRetiredPageView locale="zh" />
}
