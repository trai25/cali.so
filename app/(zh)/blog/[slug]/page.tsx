import {
  blogPostMetadata,
  BlogPostRoute,
  generatePostStaticParams,
} from '../../../_views/blog-post-page'

export const generateStaticParams = generatePostStaticParams
export const prefetch = 'allow-runtime'

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  return blogPostMetadata('zh', (await params).slug)
}

export default function ChineseBlogPostPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  return <BlogPostRoute params={params} locale="zh" />
}
