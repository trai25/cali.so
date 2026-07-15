import {
  blogPostMetadata,
  BlogPostPageView,
  generatePostStaticParams,
} from '../../../../_views/blog-post-page'

export const generateStaticParams = generatePostStaticParams

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  return blogPostMetadata('en', (await params).slug)
}

export default async function EnglishBlogPostPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  return <BlogPostPageView slug={(await params).slug} locale="en" />
}
