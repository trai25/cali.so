import {
  blogPostMetadata,
  BlogPostPageView,
  generatePostStaticParams,
} from '../../../../_views/blog-post-page'

// TODO: Cache Components adoption. Refactor this route so this opt-out can be removed.
// See: https://nextjs.org/docs/app/guides/migrating-to-cache-components
export const instant = false

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
