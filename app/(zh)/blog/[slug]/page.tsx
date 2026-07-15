import {
  blogPostMetadata,
  BlogPostPageView,
  generatePostStaticParams,
} from '../../../_views/blog-post-page'

export const dynamicParams = false

export const generateStaticParams = generatePostStaticParams

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  return blogPostMetadata('zh', (await params).slug)
}

export default async function ChineseBlogPostPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  return <BlogPostPageView slug={(await params).slug} locale="zh" />
}
