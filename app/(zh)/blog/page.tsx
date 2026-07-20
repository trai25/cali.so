import { BlogIndexPageView } from '../../_views/blog-index-page'
import { localeMetadata } from '~/lib/locale-metadata'
import { publicPageMetadata } from '~/lib/public-page-metadata'

const copy = publicPageMetadata.blog.zh

export const metadata = localeMetadata({
  locale: 'zh',
  path: '/blog',
  ...copy,
})

export default function ChineseBlogIndexPage() {
  return <BlogIndexPageView locale="zh" />
}
