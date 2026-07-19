import Link from 'next/link'
import type { Metadata } from 'next'

import { AmaIntroductionStage } from '~/components/ama/ama-introduction-stage'
import { PixelCluster } from '~/components/pixel-cluster'
import { AMA_TOPIC_LABELS, AMA_TOPICS } from '~/lib/ama/booking/topics'
import { T } from '~/lib/i18n'
import { localeMetadata } from '~/lib/locale-metadata'
import { localePath, type Locale } from '~/lib/locale-route'
import { publicPageMetadata } from '~/lib/public-page-metadata'

export function amaPageMetadata(locale: Locale): Metadata {
  const copy = publicPageMetadata.ama[locale]
  return localeMetadata({
    locale,
    path: '/ama',
    title: copy.title,
    description: copy.description,
  })
}

const SPEC_ROWS = [
  { zhLabel: '时长', enLabel: 'Duration', zhValue: '60 分钟', enValue: '60 minutes' },
  { zhLabel: '价格', enLabel: 'Price', zhValue: 'US$99', enValue: 'US$99' },
  {
    zhLabel: '形式',
    enLabel: 'Format',
    zhValue: 'Google Meet 或腾讯会议',
    enValue: 'Google Meet or Tencent Meeting',
  },
  { zhLabel: '需提前', enLabel: 'Notice', zhValue: '24 小时', enValue: '24 hours' },
  {
    zhLabel: '可约时间',
    enLabel: 'Booking window',
    zhValue: '未来 30 天',
    enValue: 'Next 30 days',
  },
] as const

const STEPS = [
  {
    zh: '选个时间，看到的都是你当地的时间。',
    en: 'Pick a time. Everything is shown in your time zone.',
  },
  {
    zh: '写几句你想聊什么，相关链接也可以直接丢进来。',
    en: 'Tell me what you want to work through, and drop in any useful links.',
  },
  {
    zh: '付款会跳到 Stripe Checkout，银行卡信息不会经过本站。',
    en: 'Payment happens in Stripe Checkout, so your card details never touch this site.',
  },
  {
    zh: '付完款，日历邀请和会议链接会发到你的邮箱。',
    en: 'After payment, you’ll get the calendar invite and meeting link by email.',
  },
  {
    zh: '同一封邮件里也有管理链接。之后想改期或取消，点进去就行。',
    en: 'That email also includes your Manage Link, where you can reschedule or cancel.',
  },
] as const

const TESTIMONIALS = [
  {
    zh: '感谢上次的在线聊天。目前我已经拿到了 3 个 offer，选择了一个。',
    en: 'Thank you for the chat last time. I have since received three offers and accepted one.',
    zhAttribution: '一位工程师，2023',
    enAttribution: 'An engineer, 2023',
  },
  {
    zh: '上线了一个 MVP 之后，公司立刻把我转正，不用三个月的试用期考察！',
    en: 'After I shipped an MVP in my first week, the company converted me to full time right away, skipping the three month probation.',
    zhAttribution: '一位工程师，2023',
    enAttribution: 'An engineer, 2023',
  },
  {
    zh: '非常感谢您今天 AMA 的分享，听完之后收获很多，也觉得您的经验和建议很真诚、很有启发，解答了我很多问题 😁😁',
    en: 'Thank you so much for today’s AMA. I learned a lot, and your experience and advice felt sincere and insightful. You answered so many of my questions.',
    zhAttribution: '一位来访者，2026',
    enAttribution: 'An AMA guest, 2026',
  },
] as const

function SectionHeading({
  index,
  zh,
  en,
  delay,
}: {
  index: string
  zh: string
  en: string
  delay: number
}) {
  return (
    <h2
      className="section-tag enter"
      style={{ '--enter-delay': `${delay}ms` } as React.CSSProperties}
    >
      <span className="section-tag-index" aria-hidden>
        {index}
      </span>
      <span className="section-tag-hatch" aria-hidden />
      <span className="section-tag-label">
        <T zh={zh} en={en} />
      </span>
    </h2>
  )
}

/**
 * The public AMA service page: a spec sheet, not a sales page. Everything
 * transactional lives one step away at /ama/book.
 */
export function AmaPageView() {
  return (
    <div className="mx-auto w-full max-w-[37.5rem] px-6">
      <AmaIntroductionStage>
        <div className="flex items-start justify-between gap-4">
          <header className="max-w-[34rem]">
            <h1 className="page-eyebrow enter">
              <T zh="一对一" en="AMA" />
            </h1>
            <p
              className="page-introduction enter mt-4 text-balance"
              style={{ '--enter-delay': '70ms' } as React.CSSProperties}
            >
              <T
                zh="带着你最近卡住的问题来。不管是产品、设计、工程、职业，还是你正在搭的 AI 工作流，我们花一小时一起拆。"
                en="Bring the thing you’re stuck on. Product, design, engineering, career, or the AI workflow you’re building. We’ll spend an hour working through it together."
              />
            </p>
          </header>
          <PixelCluster variant={5} className="enter shrink-0" />
        </div>
      </AmaIntroductionStage>

      <section
        className="enter mt-6 pb-4"
        style={{ '--enter-delay': '120ms' } as React.CSSProperties}
        aria-label="AMA Session"
      >
        <dl className="spec-nameplate">
          {SPEC_ROWS.map((row) => (
            <div key={row.enLabel}>
              <dt>
                <T zh={row.zhLabel} en={row.enLabel} />
              </dt>
              <dd>
                <T zh={row.zhValue} en={row.enValue} />
              </dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="mt-12" aria-labelledby="ama-who-heading">
        <div id="ama-who-heading">
          <SectionHeading index="01" zh="关于我" en="About me" delay={170} />
        </div>
        <p className="page-introduction mt-4">
          <T
            zh="我是 Cali，佐玩（Zolplay）的创始人。这些年一直在 product design 和工程之间来回切换，Web、iOS、独立产品都亲手做过。现在大部分工作都跑在自己搭的 software factory 里，Linear、Codex、Claude Code、Slack 和 Cursor 串在一起，从想法一路做到 ship。你可以来聊一个具体 workflow，也可以直接把手上的问题带来。中文、英文，混着聊都行。"
            en="I’m Cali, founder of Zolplay. I’ve spent years moving between product design and engineering across web, iOS, and my own products. These days, most of that work runs through a software factory I built around Linear, Codex, Claude Code, Slack, and Cursor, from the first idea through shipping. We can unpack a specific workflow or work directly on whatever is in front of you, in English, Chinese, or both."
          />
        </p>
      </section>

      <section className="mt-12" aria-labelledby="ama-topics-heading">
        <div id="ama-topics-heading">
          <SectionHeading index="02" zh="聊什么" en="Topics" delay={200} />
        </div>
        <ul className="mt-4 text-sm">
          {AMA_TOPICS.map((topic) => {
            const label = AMA_TOPIC_LABELS[topic]
            return (
              <li key={topic} className="hairline-top py-2.5 first:border-t-0">
                <T zh={label.zh} en={label.en} />
              </li>
            )
          })}
        </ul>
      </section>

      <section className="mt-12" aria-labelledby="ama-process-heading">
        <div id="ama-process-heading">
          <SectionHeading index="03" zh="怎么预约" en="Booking" delay={230} />
        </div>
        <ol className="mt-4 flex flex-col gap-3 text-sm">
          {STEPS.map((step, index) => (
            <li
              key={step.en}
              className="grid grid-cols-[1.5rem_minmax(0,1fr)] items-baseline gap-2 leading-6"
            >
              <span aria-hidden className="step-index">
                {String(index + 1).padStart(2, '0')}
              </span>
              <span className="text-balance">
                <T zh={step.zh} en={step.en} />
              </span>
            </li>
          ))}
        </ol>
      </section>

      <section className="mt-12" aria-labelledby="ama-policy-heading">
        <div id="ama-policy-heading">
          <SectionHeading index="04" zh="改期与退款" en="Rescheduling and refunds" delay={260} />
        </div>
        <p className="page-introduction mt-4">
          <T
            zh="离开始还有 24 小时以上，改期和取消都免费；取消后会自动全额退款。不到 24 小时就不再自动退款。"
            en="If we’re at least 24 hours out, you can reschedule or cancel for free. Cancellations are refunded automatically. Inside 24 hours, refunds are no longer automatic."
          />
        </p>
      </section>

      <section className="mt-12" aria-labelledby="ama-notes-heading">
        <div id="ama-notes-heading">
          <SectionHeading index="05" zh="聊过的人说" en="What people said" delay={290} />
        </div>
        <div className="mt-4 flex flex-col gap-6">
          {TESTIMONIALS.map((testimonial, index) => (
            // `.hairline-top` is unlayered, so a Tailwind `first:border-t-0`
            // utility can't override it — apply the divider by index instead.
            <figure
              key={testimonial.en}
              className={index === 0 ? '' : 'hairline-top pt-4'}
            >
              <blockquote className="text-sm leading-6">
                <T zh={`「${testimonial.zh}」`} en={`"${testimonial.en}"`} />
              </blockquote>
              <figcaption className="mt-2 text-[13px] text-muted-foreground">
                <T zh={testimonial.zhAttribution} en={testimonial.enAttribution} />
              </figcaption>
            </figure>
          ))}
        </div>
      </section>

      <div
        className="enter mt-12 pb-4"
        style={{ '--enter-delay': '320ms' } as React.CSSProperties}
      >
        <span data-zh-block>
          <Link href={localePath('zh', '/ama/book')} className="btn-cta">
            约个时间
          </Link>
        </span>
        <span data-en-block>
          <Link href={localePath('en', '/ama/book')} className="btn-cta">
            Book an hour
          </Link>
        </span>
      </div>
    </div>
  )
}
