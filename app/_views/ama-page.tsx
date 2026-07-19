import Link from 'next/link'
import type { Metadata } from 'next'
import { ClaudeIcon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'

import { AmaIntroductionStage } from '~/components/ama/ama-introduction-stage'
import { Favicon } from '~/components/favicon'
import { PixelCluster } from '~/components/pixel-cluster'
import { AMA_TOPICS, type AmaTopic } from '~/lib/ama/booking/topics'
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
    zhAttribution: '一位大学生，2026',
    enAttribution: 'A university student, 2026',
  },
] as const

const AMA_TOPIC_PAGE_COPY: Record<
  AmaTopic,
  {
    zhLabel: string
    zhDescription: string
    enLabel: string
    enDescription: string
  }
> = {
  engineering: {
    zhLabel: 'Web、iOS 与全栈工程',
    zhDescription: '技术选择、架构、实现，以及怎么和 agents 一起把东西做出来。',
    enLabel: 'Web, iOS, and full-stack engineering',
    enDescription: 'Technical choices, architecture, and shipping with agents.',
  },
  'product-design': {
    zhLabel: '产品判断与产品设计',
    zhDescription:
      '当答案越来越容易得到，怎么判断什么值得做，也把自己的品味落到产品和界面细节里。',
    enLabel: 'Product strategy and design',
    enDescription: 'What to build, how to shape it, and how the interface should feel.',
  },
  'ai-workflows': {
    zhLabel: 'AI 工作流与 Coding Agents',
    zhDescription:
      '从 Prompt、Memory 到多 agent 协作，怎么搭一套真的能跑、也真的能 ship 的 workflow。',
    enLabel: 'AI workflows and coding agents',
    enDescription: 'Prompts, memory, and multi-agent workflows that actually ship.',
  },
  career: {
    zhLabel: '职业、出海与英语学习',
    zhDescription: '怎么选机会、进入新的市场和语境，也更快建立自己的优势。',
    enLabel: 'Career moves and cross-disciplinary work',
    enDescription: 'Choosing opportunities, changing fields, and learning fast.',
  },
  'indie-business': {
    zhLabel: '独立开发、创业与 GTM',
    zhDescription:
      '从一个模糊的 idea 到 MVP、验证、定价，再决定下一步往哪里走。',
    enLabel: 'Startups, product building, and GTM',
    enDescription: 'Strategy, MVPs, validation, pricing, and what comes next.',
  },
  'team-leadership': {
    zhLabel: '团队、协作与带人',
    zhDescription:
      '怎么把个人经验变成团队可以复用的系统，而不是每件事都重新来一次。',
    enLabel: 'Teams, collaboration, and leadership',
    enDescription: 'Turning personal experience into systems the team can reuse.',
  },
  'something-else': {
    zhLabel: '其他你正在想的',
    zhDescription: '不属于上面任何一类也没关系。',
    enLabel: 'Anything else on your mind',
    enDescription: 'If it’s on your mind, it’s fair game.',
  },
}

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
            <div
              className="page-introduction enter mt-4 text-balance"
              style={{ '--enter-delay': '70ms' } as React.CSSProperties}
            >
              <div data-zh-block className="flex flex-col gap-3">
                <p>AI 让答案越来越便宜，真正值钱的，反而是你怎么判断。</p>
                <p>
                  这几年，我一边做产品设计、工程和独立开发，一边折腾创业、出海，也在重新搭自己的 AI
                  工作方式。用 Codex、Claude Code 或 Cursor
                  写代码，只是最表面的一层。再往下，是把经验沉淀成 Prompt、Workflow、Memory 和
                  Agent，让一个人的能力可以被放大，也让想法更快走到 ship 和验证。
                </p>
                <p>
                  但工具终究只是工具。真正拉开差距的，可能是另外几件事：对未知还有没有好奇心，面对共识能不能保留自己的判断，会不会借
                  AI
                  放大自己，遇到新东西学得够不够快，以及能不能把一个领域的方法带到另一个领域。
                </p>
                <p>
                  这些听起来像在聊 AI Native，其实最后都会落到很具体的选择：工作怎么选，产品值不值得做，独立开发和创业下一步往哪里走，怎么出海，怎么把自己、团队和
                  agents 连成一套真正能跑起来的系统。
                </p>
                <p>
                  如果你也正好在想这些，不妨来试试。说不定聊着聊着，就会看到一个原来没想到的角度。
                </p>
              </div>
              <div data-en-block>
                <div className="flex flex-col gap-4">
                  <p>Answers are getting cheaper. Judgment is getting more valuable.</p>
                  <p>
                    I’ve spent the last few years across product design, engineering, indie
                    development, and startups. Along the way, I’ve rebuilt how I work around AI.
                  </p>
                  <p>
                    AI tools are the easy part. I spend more time turning what I know into prompts,
                    workflows, memory, and agents.
                  </p>
                  <p>
                    That gives me leverage. Judgment still decides what to build, what to skip, and
                    where to go next.
                  </p>
                  <p>If you’re working through questions like that, let’s talk.</p>
                </div>
              </div>
            </div>
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
        <div className="mt-4">
          <div data-zh-block className="flex flex-col gap-3 page-introduction">
            <p>
              我是 Cali，佐玩（Zolplay）的创始人。Web、iOS、产品设计和独立产品都亲手做过，也一路做过团队、创业和出海。
            </p>
            <p>
              现在我最感兴趣的，不是再多学一个 AI
              工具，而是怎么把产品判断、设计、工程和公司的日常运转重新连起来。我给自己搭了一套 software factory：从{' '}
              <AmaProductName name="Linear" /> 里的想法和 issue 出发，让{' '}
              <AmaProductName name="Codex" />、<AmaProductName name="Claude Code" /> 和{' '}
              <AmaProductName name="Cursor" /> 参与调研、拆 scope、实现和 review，最后回到{' '}
              <AmaProductName name="Slack" />，跟团队继续往前走。
            </p>
            <p>
              除此之外，我还自己部署了一套 OpenClaw，负责调度多个 agents。我把
              PM、财务和日常运营的工作分给不同的 agents，再由 OpenClaw
              统一调度。很多原本需要人盯着一步步做的事情，现在已经可以从头到尾自动跑完。
            </p>
            <p>
              我当然不是严格意义上的 OPC，公司也不是只有我一个人。但我确实在践行很多 OPC
              的方法：把经验留进系统，把重复工作交给 agents，把人的注意力放回方向、取舍和品味。
            </p>
            <p>
              我越来越相信，AI Native
              最后不会只是一套工具栈，而会成为公司文化里必不可少的一部分。怎么做产品、怎么协作、怎么分配工作，都会跟着改变。
            </p>
          </div>
          <div data-en-block className="page-introduction">
            <div className="flex flex-col gap-4">
              <p>
                I’m Cali, founder of Zolplay. My work spans web, iOS, engineering, product design,
                and indie products. Through Zolplay, I’ve helped teams at Apple, Insta360, and
                YC-backed startups with strategy, product design, and turning ideas into working
                products.
              </p>
              <p>
                Before that, I worked at game studios in Seattle on large projects with Niantic,
                Microsoft, and Google.
              </p>
              <p>
                My software factory connects product judgment, design, engineering, and operations.
                Ideas start in <AmaProductName name="Linear" />;{' '}
                <AmaProductName name="Codex" />, <AmaProductName name="Claude Code" />, and{' '}
                <AmaProductName name="Cursor" /> help with research, scoping, implementation, and
                review; the work returns to <AmaProductName name="Slack" /> and the team.
              </p>
              <p>
                I also run a self-hosted OpenClaw setup that orchestrates agents across PM, finance,
                and day-to-day operations. Many processes now run end to end on their own.
              </p>
              <p>
                Zolplay isn’t a one-person company. But I borrow the useful part of that model: put
                knowledge into systems, hand repetitive work to agents, and keep human attention
                on judgment and taste.
              </p>
              <p>
                I believe an AI-native approach will become an essential part of company culture.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="mt-12" aria-labelledby="ama-topics-heading">
        <div id="ama-topics-heading">
          <SectionHeading index="02" zh="聊什么" en="Topics" delay={200} />
        </div>
        <div data-zh-block className="page-introduction mt-4 flex flex-col gap-3">
          <p>不一定要从 AI 开始。</p>
          <p>
            职业、产品、工程、出海，看起来是不同的问题，背后经常都在判断同一件事：什么值得做，什么可以交给系统，什么必须由你自己决定。
          </p>
        </div>
        <div data-en-block className="page-introduction mt-4">
          <div className="flex flex-col gap-3">
            <p>AI doesn’t have to be the starting point.</p>
            <p>
              Careers, products, and engineering can look like separate problems. Often they come
              down to the same judgment: what’s worth doing, what a system can handle, and what
              still needs your judgment.
            </p>
          </div>
        </div>
        <ul className="mt-4 text-sm">
          {AMA_TOPICS.map((topic) => {
            const pageCopy = AMA_TOPIC_PAGE_COPY[topic]
            return (
              <li key={topic} className="hairline-top py-3 first:border-t-0">
                <span data-zh-block className="block">
                  <span className="block">{pageCopy.zhLabel}</span>
                  <span className="mt-1 block text-[13px] leading-5 text-muted-foreground">
                    {pageCopy.zhDescription}
                  </span>
                </span>
                <span data-en-block className="block">
                  <span className="block">{pageCopy.enLabel}</span>
                  <span className="mt-1 block text-[13px] leading-5 text-muted-foreground">
                    {pageCopy.enDescription}
                  </span>
                </span>
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
