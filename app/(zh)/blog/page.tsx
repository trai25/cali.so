import { BlogIndexPageView } from '../../_views/blog-index-page'
import { localeMetadata } from '~/lib/locale-metadata'

export const metadata = localeMetadata({
  locale: 'zh',
  path: '/blog',
  title: '写作',
  description: 'Cali 的博客文章',
})

export default function ChineseBlogIndexPage() {
  return <BlogIndexPageView locale="zh" />
}
