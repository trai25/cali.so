import Link from 'next/link'

import { Bookshelf } from '~/components/bookshelf'
import { ExternalLabel } from '~/components/external-mark'
import { HalftonePortrait } from '~/components/halftone-portrait'
import { NavCards } from '~/components/nav-cards'
import { PostRow } from '~/components/post-row'
import { VinylShelf } from '~/components/vinyl-shelf'
import { getAllPosts } from '~/lib/content'
import { books, experience, records } from '~/lib/personal'
import { projects } from '~/lib/projects'
import { T } from '~/lib/i18n'

function SectionTitle({ children, delay }: { children: React.ReactNode; delay: number }) {
  return (
    <h2
      className="enter text-sm font-medium text-muted-foreground"
      style={{ '--enter-delay': `${delay}ms` } as React.CSSProperties}
    >
      {children}
    </h2>
  )
}

export default function HomePage() {
  const posts = getAllPosts()
  const latest = posts.slice(0, 5)
  const center = (latest.length - 1) / 2

  return (
    <div className="mx-auto w-full max-w-[37.5rem] px-6">
      <div className="flex flex-col-reverse justify-between gap-10 sm:flex-row sm:items-start">
        <div className="enter max-w-[19rem]">
          <h1 className="text-sm font-semibold">Cali Castle</h1>
          <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
            <T zh="开发者、设计师、细节控、创始人。" en="Developer, designer, perfectionist, founder." />
          </p>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
            <T
              zh="我是 Cali，"
              en={<>I&apos;m Cali, founder of </>}
            />
            <a
              href="https://zolplay.com"
              target="_blank"
              rel="noreferrer"
              className="text-foreground underline decoration-border underline-offset-4 transition-colors duration-150 ease-[ease] hover:decoration-foreground"
            >
              <ExternalLabel>佐玩</ExternalLabel>
            </a>
            <T
              zh="创始人，目前带领着佐玩致力于创造一个充满创造力的工作环境，鼓励团队创造影响世界的产品。热爱开发、设计、创新，享受生活，以及在未知领域中探索。"
              en=", where I lead a team building products that matter, in a workplace full of creativity. I love building, designing, innovating — and wandering into the unknown."
            />
          </p>
        </div>
        <div
          className="enter w-44 shrink-0 sm:w-60"
          style={{ '--enter-delay': '80ms' } as React.CSSProperties}
        >
          <HalftonePortrait
            srcLight="/images/headshot.jpg"
            srcDark="/images/portrait-square.jpg"
            alt="Cali 的半调网点肖像"
          />
        </div>
      </div>

      <NavCards postCount={posts.length} projectCount={projects.length} />

      <section className="mt-16">
        <SectionTitle delay={120}><T zh="经历" en="Experience" /></SectionTitle>
        <ul className="mt-4 flex flex-col">
          {experience.map((job, i) => (
            <li
              key={job.company}
              className="enter-swing hairline-top"
              style={{ '--enter-delay': `${150 + i * 40}ms` } as React.CSSProperties}
            >
              <div className="experience-row text-sm">
                <span className="flex items-baseline gap-3">
                  {job.url ? (
                    <a
                      href={job.url}
                      target="_blank"
                      rel="noreferrer"
                      className="font-medium transition-colors duration-150 ease-[ease] hover:text-foreground"
                    >
                      <ExternalLabel>{job.company}</ExternalLabel>
                    </a>
                  ) : (
                    <span className="font-medium">{job.company}</span>
                  )}
                  <span className="text-muted-foreground">
                    <T zh={job.role} en={job.roleEn ?? job.role} />
                  </span>
                </span>
                <span className="shrink-0 text-muted-foreground tabular-nums">
                  {job.from}–{job.to ?? <T zh="今" en="now" />}
                </span>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-16">
        <div className="flex items-center justify-between gap-4">
          <SectionTitle delay={200}><T zh="写作" en="Writing" /></SectionTitle>
          <Link
            href="/blog"
            className="enter relative shrink-0 text-sm text-muted-foreground transition-colors duration-150 ease-[ease] after:absolute after:-inset-x-2 after:-inset-y-3 after:content-[''] hover:text-foreground focus-visible:rounded-sm focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-4"
            style={{ '--enter-delay': '200ms' } as React.CSSProperties}
          >
            <T zh="查看全部" en="View all" />
          </Link>
        </div>
        <ul className="focus-list mt-4 flex flex-col">
          {latest.map((post, index) => (
            <li
              key={post.slug}
              className="enter-swing"
              // stagger from the center out, with a tiny swing
              style={
                { '--enter-delay': `${240 + Math.abs(index - center) * 50}ms` } as React.CSSProperties
              }
            >
              <PostRow post={post} headingLevel="h3" dateStyle="short" />
            </li>
          ))}
        </ul>
      </section>

      {records.length > 0 && (
        <section className="mt-16">
          <SectionTitle delay={320}><T zh="唱片机" en="On rotation" /></SectionTitle>
          <div className="enter mt-5" style={{ '--enter-delay': '360ms' } as React.CSSProperties}>
            <VinylShelf />
          </div>
        </section>
      )}

      {books.length > 0 && (
        <section className="mt-16">
          <SectionTitle delay={380}><T zh="书架" en="Bookshelf" /></SectionTitle>
          <div className="enter mt-5" style={{ '--enter-delay': '420ms' } as React.CSSProperties}>
            <Bookshelf />
          </div>
        </section>
      )}
    </div>
  )
}
