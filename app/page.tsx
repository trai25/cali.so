import Link from 'next/link'

import { getAllPosts } from '~/lib/content'
import { formatDate } from '~/lib/date'

export default function HomePage() {
  const posts = getAllPosts()

  return (
    <div className="mx-auto w-full max-w-[37.5rem] px-6">
      <h1 className="text-sm font-semibold">Cali Castle</h1>
      <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
        开发者、设计师、创始人。正在打造 Zolplay 与一些有趣的产品。
      </p>

      <section className="mt-16">
        <h2 className="text-sm font-medium text-muted-foreground">写作</h2>
        <ul className="mt-4 flex flex-col">
          {posts.map((post) => (
            <li key={post.slug}>
              <Link
                href={`/blog/${post.slug}`}
                className="hairline-top group flex items-baseline justify-between gap-4 py-3 text-sm"
              >
                <span className="font-medium transition-colors duration-150 ease-[ease] group-hover:text-foreground">
                  {post.title}
                </span>
                <time
                  dateTime={post.publishedAt.toISOString()}
                  className="shrink-0 text-sm text-muted-foreground tabular-nums"
                >
                  {formatDate(post.publishedAt)}
                </time>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}
