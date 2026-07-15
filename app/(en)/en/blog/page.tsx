import { BlogIndexPageView } from '../../../_views/blog-index-page'
import { localeMetadata } from '~/lib/locale-metadata'

export const metadata = localeMetadata({
  locale: 'en',
  path: '/blog',
  title: 'Writing',
  description: "Cali's blog posts",
})

export default function EnglishBlogIndexPage() {
  return <BlogIndexPageView locale="en" />
}
