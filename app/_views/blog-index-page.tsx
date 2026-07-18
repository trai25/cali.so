import { WritingInkStage } from '~/components/hidden-list-stage'
import { PostRow } from '~/components/post-row'
import { RevealScope } from '~/components/reveal-scope'
import { getAllPosts } from '~/lib/content'
import { T } from '~/lib/i18n'
import type { Locale } from '~/lib/locale-route'

export function BlogIndexPageView({ locale }: { locale: Locale }) {
  const posts = getAllPosts()
  const postsByYear = new Map<number, typeof posts>()

  for (const post of posts) {
    const year = post.publishedAt.getUTCFullYear()
    const yearPosts = postsByYear.get(year)

    if (yearPosts) yearPosts.push(post)
    else postsByYear.set(year, [post])
  }

  return (
    <div className="mx-auto w-full max-w-[37.5rem] px-6">
      <h1 className="enter text-sm font-medium text-muted-foreground">
        <T zh="写作" en="Writing" />
      </h1>
      <WritingInkStage className="mt-6" contentClassName="flex flex-col gap-8">
        {[...postsByYear].map(([year, yearPosts]) => {
          const center = (yearPosts.length - 1) / 2

          return (
            <section key={year} aria-labelledby={`posts-${year}`}>
              <h2
                id={`posts-${year}`}
                className="enter text-sm font-medium text-muted-foreground tabular-nums"
              >
                {year}
              </h2>
              <RevealScope as="ul" className="focus-list mt-2 flex flex-col">
                {yearPosts.map((post, index) => (
                  <li
                    key={post.slug}
                    className="enter-swing"
                    style={
                      {
                        '--enter-delay': `${120 + Math.abs(index - center) * 50}ms`,
                      } as React.CSSProperties
                    }
                  >
                    <PostRow
                      post={post}
                      headingLevel="h3"
                      dateStyle="month-day"
                      locale={locale}
                      listStageId={post.slug}
                    />
                  </li>
                ))}
              </RevealScope>
            </section>
          )
        })}
      </WritingInkStage>
    </div>
  )
}
