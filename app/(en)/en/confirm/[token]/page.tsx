import {
  newsletterRetiredMetadata,
  NewsletterRetiredPageView,
} from '../../../../_views/newsletter-retired-page'

export const metadata = newsletterRetiredMetadata('en')

// The token parameter is deliberately not accepted or read. This route only
// preserves the old URL shape and cannot query or mutate subscriber data.
export default function EnglishNewsletterRetiredPage() {
  return <NewsletterRetiredPageView locale="en" />
}
