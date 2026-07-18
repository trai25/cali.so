import Link from 'next/link'
import type { Metadata } from 'next'

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
  { zhLabel: '提前预订', enLabel: 'Notice', zhValue: '24 小时', enValue: '24 hours' },
  { zhLabel: '预约范围', enLabel: 'Window', zhValue: '未来 30 天', enValue: 'Next 30 days' },
] as const

const STEPS = [
  {
    zh: '选一个时间。所有时间都按你的时区显示。',
    en: 'Pick a time. Every time is shown in your own time zone.',
  },
  {
    zh: '写一份 Booking Brief，告诉我这一小时怎么用才最值。',
    en: 'Share a Booking Brief so the hour goes where it matters most.',
  },
  {
    zh: '通过 Stripe 托管页面付款，银行卡信息不会经过本站。',
    en: 'Pay through Stripe Checkout. It is hosted by Stripe; card details never touch this site.',
  },
  {
    zh: '日历邀请和会议链接会发到你的邮箱。',
    en: 'The calendar invite and meeting link arrive by email.',
  },
  {
    zh: '邮件里还有一个专属管理链接，随时可以改期或取消。',
    en: 'The same email carries a private Manage Link for rescheduling or cancelling any time.',
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
              zh="与 Cali 的专注一小时。一场 60 分钟的一对一 AMA，你带着问题来，我们把它聊透。"
              en="A focused hour with Cali. One 60 minute one-to-one AMA Session: you bring the questions, we work through them properly."
            />
          </p>
        </header>
        <PixelCluster variant={5} className="enter shrink-0" />
      </div>

      <section
        className="enter mt-10"
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
          <SectionHeading index="01" zh="这一小时和谁聊" en="Who you are talking to" delay={170} />
        </div>
        <p className="page-introduction mt-4">
          <T
            zh="我是佐玩（Zolplay）的创始人，做了多年产品工程，横跨 Web 与 iOS，也独立做过并上线过自己的产品。中英文都可以聊，一种语言或两种混着来，这一小时都是你的。"
            en="I founded Zolplay, spent years doing product engineering across web and iOS, and have built and shipped indie products of my own. I work in both English and Chinese; the hour is yours, in one language or both."
          />
        </p>
      </section>

      <section className="mt-12" aria-labelledby="ama-topics-heading">
        <div id="ama-topics-heading">
          <SectionHeading index="02" zh="可以聊的话题" en="Topics" delay={200} />
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
          <SectionHeading index="03" zh="预订流程" en="How it works" delay={230} />
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
            zh="开始前 24 小时以外，改期和取消都免费，取消自动全额退款；进入 24 小时以内则不再自动退款。这一小时属于你，中文、英文或两种都行。"
            en="Until 24 hours before the session, rescheduling is free and cancelling refunds you in full, automatically. Inside 24 hours there is no automatic refund. The hour is yours, in one language or both."
          />
        </p>
      </section>

      <section className="mt-12" aria-labelledby="ama-notes-heading">
        <div id="ama-notes-heading">
          <SectionHeading index="05" zh="来自聊过的人" en="From past sessions" delay={290} />
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
            预订时间
          </Link>
        </span>
        <span data-en-block>
          <Link href={localePath('en', '/ama/book')} className="btn-cta">
            Book a time
          </Link>
        </span>
      </div>
    </div>
  )
}
