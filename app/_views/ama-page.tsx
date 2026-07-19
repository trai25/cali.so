import Link from 'next/link'
import type { Metadata } from 'next'
import { ClaudeIcon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'

import { AmaIntroductionStage } from '~/components/ama/ama-introduction-stage'
import { Favicon } from '~/components/favicon'
import { PixelCluster } from '~/components/pixel-cluster'
import { AMA_TOPIC_LABELS, AMA_TOPICS } from '~/lib/ama/booking/topics'
import { T } from '~/lib/i18n'
import { faviconUrl } from '~/lib/link-previews'
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
    zh: '付款会跳到 Stripe，银行卡信息不会经过本站。',
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

const AMA_PRODUCTS = {
  Linear: 'https://linear.app',
  Codex: null,
  'Claude Code': null,
  Slack: 'https://slack.com',
  Cursor: 'https://cursor.com',
} as const

type AmaProduct = keyof typeof AMA_PRODUCTS

function AmaProductName({ name }: { name: AmaProduct }) {
  let logo: React.ReactNode

  if (name === 'Codex') {
    logo = <Favicon className="ama-product-logo" src="/images/codex.svg" size={14} />
  } else if (name === 'Claude Code') {
    logo = (
      <HugeiconsIcon
        className="ama-product-logo"
        icon={ClaudeIcon}
        size={14}
        strokeWidth={1.8}
        aria-hidden
      />
    )
  } else {
    logo = (
      <Favicon
        className="ama-product-logo"
        src={faviconUrl(AMA_PRODUCTS[name])!}
        size={14}
      />
    )
  }

  return (
    <span className="ama-product-name" data-ama-product-name={name}>
      {logo}
      <span>{name}</span>
    </span>
  )
}

function AmaBookingCta() {
  return (
    <>
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
    </>
  )
}

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
                zh="这些年做产品设计、工程、独立开发，也折腾创业、出海和 AI 工作流，我越来越觉得，我们缺的往往不是更多建议，而是一个能把事情看清楚的角度。看起来完全不同的问题，最后其实都绕不开三件事：怎么判断，怎么取舍，下一步先做什么。这个 AMA，就是留出一小时，把这些事聊清楚。"
                en="After years in product design, engineering, indie development, startups, going global, and now AI workflows, I’ve learned that more advice usually isn’t the answer. What helps is a clearer way to see the situation. Different problems tend to come back to the same three questions: what matters, what are the tradeoffs, and what should happen next. This AMA gives us an hour to get clear on them."
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

      <div
        className="ama-booking-cta enter mt-6"
        style={{ '--enter-delay': '150ms' } as React.CSSProperties}
      >
        <AmaBookingCta />
      </div>

      <section className="mt-12" aria-labelledby="ama-who-heading">
        <div id="ama-who-heading">
          <SectionHeading index="01" zh="关于我" en="About me" delay={170} />
        </div>
        <div className="mt-4 flex flex-col gap-3">
          <p className="page-introduction">
            <T
              zh="我是 Cali，佐玩（Zolplay）的创始人。Web、iOS、产品设计和独立产品都亲手做过。"
              en="I’m Cali, founder of Zolplay. I’ve worked hands-on across web, iOS, product design, and my own products."
            />
          </p>
          <p className="page-introduction">
            <T
              zh={
                <>
                  现在，我更感兴趣的是，怎么把产品判断、设计、工程和团队协作，连成一套真正能跑起来的系统。我给自己搭了一套 software factory：从{' '}
                  <AmaProductName name="Linear" /> 里的想法和 issue 出发，让{' '}
                  <AmaProductName name="Codex" />、<AmaProductName name="Claude Code" /> 和{' '}
                  <AmaProductName name="Cursor" /> 参与调研、拆 scope、实现和 review，最后回到{' '}
                  <AmaProductName name="Slack" />，和团队一起继续往前走。重点不只是「用 AI
                  写代码更快」，而是重新设计做产品的方式，让一个模糊的念头更快变成能 ship、能验证的东西。你想聊具体
                  workflow、coding agents
                  的实践，还是产品方向、创业、职业、独立开发、出海或英语学习，都可以。中文、英文，混着聊也行。
                </>
              }
              en={
                <>
                  These days, I’m more interested in how product judgment, design, engineering, and
                  team collaboration can work as one system that actually ships. I’ve built a
                  software factory that starts with ideas and issues in <AmaProductName name="Linear" />,
                  then brings{' '}
                  <AmaProductName name="Codex" />, <AmaProductName name="Claude Code" />, and{' '}
                  <AmaProductName name="Cursor" /> into research, scoping, implementation, and review
                  before the work comes back to <AmaProductName name="Slack" /> and the team. The
                  point isn’t just to get AI to write code faster. It’s to redesign how
                  products get made, so a rough idea can become something real, testable, and shipped
                  with less friction. We can get specific about the workflow and coding-agent
                  practices, or talk through a product decision, startup, career move, indie project,
                  or something you’re taking global. We can talk in English, Chinese, or both.
                </>
              }
            />
          </p>
        </div>
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
        className="ama-booking-cta enter mt-12 pb-4"
        style={{ '--enter-delay': '320ms' } as React.CSSProperties}
      >
        <AmaBookingCta />
      </div>
    </div>
  )
}
