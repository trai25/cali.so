import type { Metadata } from 'next'

import { PostRow } from '~/components/post-row'
import { RevealScope } from '~/components/reveal-scope'
import { getAllPosts } from '~/lib/content'
import { T } from '~/lib/i18n'

export const metadata: Metadata = {
  title: '写作',
  description: 'Cali 的博客文章',
}

export default function BlogIndexPage() {
  const posts = getAllPosts()
  const center = (posts.length - 1) / 2

  return (
    <div className="mx-auto w-full max-w-[37.5rem] px-6">
      <h1 className="enter text-sm font-medium text-muted-foreground">
        <T zh="写作" en="Writing" />
      </h1>
      <RevealScope as="ul" className="focus-list mt-6 flex flex-col">
        {posts.map((post, index) => (
          <li
            key={post.slug}
            className="enter-swing"
            // center-out stagger with the tiny swing
            style={
              { '--enter-delay': `${120 + Math.abs(index - center) * 50}ms` } as React.CSSProperties
            }
          >
            <PostRow post={post} />
          </li>
        ))}
      </RevealScope>
    </div>
  )
}
