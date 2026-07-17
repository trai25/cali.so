import type { BookingEmailKind } from './types'

export type BookingEmailContext = {
  kind: BookingEmailKind
  locale: 'zh' | 'en'
  guestName: string
  startsAt: Date
  endsAt: Date
  guestTimeZone: string
  meetingProvider: 'google-meet' | 'tencent-meeting'
  meetingUrl: string | null
  manageUrl: string | null
  /** Only meaningful for the 'cancelled' kind. */
  refund: 'automatic' | 'none' | null
}

type Locale = BookingEmailContext['locale']

type Block =
  | { type: 'paragraph'; text: string }
  | { type: 'button'; label: string; url: string }
  | { type: 'link'; label: string; url: string }

function providerName(provider: BookingEmailContext['meetingProvider'], locale: Locale) {
  if (provider === 'google-meet') return 'Google Meet'
  return locale === 'zh' ? '腾讯会议' : 'Tencent Meeting'
}

function formatSessionTime(startsAt: Date, guestTimeZone: string, locale: Locale) {
  const intlLocale = locale === 'zh' ? 'zh-CN' : 'en-US'
  const dateTime = new Intl.DateTimeFormat(intlLocale, {
    dateStyle: 'full',
    timeStyle: 'short',
    timeZone: guestTimeZone,
  }).format(startsAt)
  const zoneName =
    new Intl.DateTimeFormat(intlLocale, {
      timeZoneName: 'short',
      timeZone: guestTimeZone,
    })
      .formatToParts(startsAt)
      .find((part) => part.type === 'timeZoneName')?.value ?? guestTimeZone
  return locale === 'zh'
    ? `${dateTime}（${zoneName}，60 分钟）`
    : `${dateTime} (${zoneName}, 60 minutes)`
}

function greeting(guestName: string, locale: Locale): Block {
  return {
    type: 'paragraph',
    text: locale === 'zh' ? `${guestName}，你好！` : `Hi ${guestName},`,
  }
}

function meetingBlocks(context: BookingEmailContext): Block[] {
  const { locale } = context
  const name = providerName(context.meetingProvider, locale)
  if (context.meetingUrl) {
    return [
      {
        type: 'paragraph',
        text: locale === 'zh' ? `会议将通过${name}进行。` : `We'll meet on ${name}.`,
      },
      {
        type: 'button',
        label: locale === 'zh' ? '加入会议' : 'Join the session',
        url: context.meetingUrl,
      },
    ]
  }
  return [
    {
      type: 'paragraph',
      text:
        locale === 'zh'
          ? `${name}的会议链接还在准备中，稍后会通过日历更新发送给你。`
          : `Your ${name} link is still being finalized and will follow in a calendar update.`,
    },
  ]
}

function policyBlock(locale: Locale): Block {
  return {
    type: 'paragraph',
    text:
      locale === 'zh'
        ? '会话开始前 24 小时之外，你可以免费改期或取消；距开始不足 24 小时时，取消将不会自动退款。'
        : 'You can reschedule or cancel for free until 24 hours before the session. Within 24 hours of the start time, cancellations are not automatically refunded.',
  }
}

function manageBlocks(
  manageUrl: string | null,
  locale: Locale,
  presentation: 'button' | 'link',
): Block[] {
  if (!manageUrl) return []
  return [
    {
      type: 'paragraph',
      text:
        locale === 'zh'
          ? '下面这条专属管理链接可以查看、改期或取消这次预订，请不要分享给别人。'
          : 'Your private Manage Link below lets you view, reschedule, or cancel this booking. Please keep it to yourself.',
    },
    {
      type: presentation,
      label: locale === 'zh' ? '管理预订' : 'Manage your booking',
      url: manageUrl,
    },
  ]
}

function signOff(): Block {
  return { type: 'paragraph', text: 'Cali' }
}

function subjectFor(kind: BookingEmailKind, locale: Locale): string {
  const subjects: Record<BookingEmailKind, Record<Locale, string>> = {
    confirmation: {
      en: 'Your AMA Session with Cali is booked',
      zh: '你的 AMA Session 已预订',
    },
    rescheduled: {
      en: 'Your AMA Session has a new time',
      zh: '你的 AMA Session 已改期',
    },
    needs_reschedule: {
      en: 'Please pick a new time for your AMA Session',
      zh: '请为你的 AMA Session 重新选择时间',
    },
    cancelled: {
      en: 'Your AMA Session has been cancelled',
      zh: '你的 AMA Session 已取消',
    },
    reminder_24h: {
      en: 'Your AMA Session is in 24 hours',
      zh: '你的 AMA Session 将在 24 小时后开始',
    },
    reminder_1h: {
      en: 'Your AMA Session starts in 1 hour',
      zh: '你的 AMA Session 将在 1 小时后开始',
    },
  }
  return subjects[kind][locale]
}

function bodyBlocks(context: BookingEmailContext): Block[] {
  const { locale } = context
  const sessionTime = formatSessionTime(context.startsAt, context.guestTimeZone, locale)
  const manageAs = context.meetingUrl ? 'link' : 'button'

  switch (context.kind) {
    case 'confirmation':
      return [
        greeting(context.guestName, locale),
        {
          type: 'paragraph',
          text:
            locale === 'zh'
              ? `谢谢你预订 AMA Session，我们的时间定在${sessionTime}。`
              : `Thank you for booking an AMA Session. We're set for ${sessionTime}.`,
        },
        ...meetingBlocks(context),
        policyBlock(locale),
        ...manageBlocks(context.manageUrl, locale, manageAs),
        {
          type: 'paragraph',
          text: locale === 'zh' ? '期待与你聊聊。' : 'Looking forward to talking with you.',
        },
        signOff(),
      ]
    case 'rescheduled':
      return [
        greeting(context.guestName, locale),
        {
          type: 'paragraph',
          text:
            locale === 'zh'
              ? `你的 AMA Session 已改期，新的时间是${sessionTime}。`
              : `Your AMA Session has been rescheduled. The new time is ${sessionTime}.`,
        },
        ...meetingBlocks(context),
        policyBlock(locale),
        ...manageBlocks(context.manageUrl, locale, manageAs),
        {
          type: 'paragraph',
          text: locale === 'zh' ? '到时见。' : 'See you then.',
        },
        signOff(),
      ]
    case 'needs_reschedule':
      return [
        greeting(context.guestName, locale),
        {
          type: 'paragraph',
          text:
            locale === 'zh'
              ? '很抱歉，在你完成付款的同时，你选中的时间被别人订走了。请放心，你的付款已经成功，预订也不会受影响，只需要重新选一个时间。'
              : 'Sorry about this: while your payment was completing, someone else took the time you picked. Your payment went through and your booking is safe, it just needs a new time.',
        },
        {
          type: 'paragraph',
          text:
            locale === 'zh'
              ? '准备好后，用下面这条专属管理链接挑一个新时间即可。这条链接可以管理这次预订，请不要分享给别人。'
              : "Whenever you're ready, pick a new time with your private Manage Link below. The link manages this booking, so please keep it to yourself.",
        },
        ...(context.manageUrl
          ? [
              {
                type: 'button',
                label: locale === 'zh' ? '重新选择时间' : 'Pick a new time',
                url: context.manageUrl,
              } satisfies Block,
            ]
          : []),
        {
          type: 'paragraph',
          text:
            locale === 'zh'
              ? '再次抱歉，期待很快见到你。'
              : 'Sorry again for the shuffle. Talk soon.',
        },
        signOff(),
      ]
    case 'cancelled':
      return [
        greeting(context.guestName, locale),
        {
          type: 'paragraph',
          text:
            locale === 'zh'
              ? `你原定于${sessionTime}的 AMA Session 已取消。`
              : `Your AMA Session scheduled for ${sessionTime} has been cancelled.`,
        },
        ...(context.refund === 'automatic'
          ? [
              {
                type: 'paragraph',
                text:
                  locale === 'zh'
                    ? '全额退款已原路退回你的付款方式，通常需要几个工作日到账。'
                    : 'A full refund has been issued to your original payment method. It may take a few business days to show up.',
              } satisfies Block,
            ]
          : []),
        ...(context.refund === 'none'
          ? [
              {
                type: 'paragraph',
                text:
                  locale === 'zh'
                    ? '根据取消政策，距开始不足 24 小时取消的预订不提供自动退款。'
                    : 'Per the cancellation policy, bookings cancelled within 24 hours of the start time are not automatically refunded.',
              } satisfies Block,
            ]
          : []),
        {
          type: 'paragraph',
          text:
            locale === 'zh'
              ? '如果有任何问题，或想重新预订，直接回复这封邮件就好。'
              : "If anything went sideways or you'd like to rebook, just reply to this email.",
        },
        signOff(),
      ]
    case 'reminder_24h':
      return [
        greeting(context.guestName, locale),
        {
          type: 'paragraph',
          text:
            locale === 'zh'
              ? `提醒一下，你的 AMA Session 快到了：${sessionTime}。`
              : `Just a reminder that your AMA Session is coming up: ${sessionTime}.`,
        },
        ...meetingBlocks(context),
        ...manageBlocks(context.manageUrl, locale, 'link'),
        signOff(),
      ]
    case 'reminder_1h':
      return [
        greeting(context.guestName, locale),
        {
          type: 'paragraph',
          text:
            locale === 'zh'
              ? `你的 AMA Session 即将开始：${sessionTime}。`
              : `Your AMA Session starts soon: ${sessionTime}.`,
        },
        ...meetingBlocks(context),
        ...manageBlocks(context.manageUrl, locale, 'link'),
        signOff(),
      ]
  }
}

function renderText(blocks: Block[], locale: Locale): string {
  const colon = locale === 'zh' ? '：' : ': '
  return blocks
    .map((block) =>
      block.type === 'paragraph' ? block.text : `${block.label}${colon}${block.url}`,
    )
    .join('\n\n')
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

const FONT_STACK =
  "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif"

function renderHtml(blocks: Block[]): string {
  const rendered = blocks
    .map((block) => {
      if (block.type === 'paragraph') {
        return `<p style="margin: 0 0 16px; color: #374151;">${escapeHtml(block.text)}</p>`
      }
      if (block.type === 'button') {
        return `<p style="margin: 24px 0;"><a href="${escapeHtml(block.url)}" style="display: inline-block; padding: 10px 20px; border-radius: 8px; background-color: #111827; color: #ffffff; text-decoration: none; font-weight: 500;">${escapeHtml(block.label)}</a></p>`
      }
      return `<p style="margin: 0 0 16px;"><a href="${escapeHtml(block.url)}" style="color: #111827; text-decoration: underline;">${escapeHtml(block.label)}</a></p>`
    })
    .join('\n')
  return `<div style="max-width: 560px; margin: 0 auto; padding: 24px 16px; font-family: ${FONT_STACK}; font-size: 14px; line-height: 1.6; color: #374151;">\n${rendered}\n</div>`
}

export function renderBookingEmail(context: BookingEmailContext): {
  subject: string
  text: string
  html: string
} {
  const blocks = bodyBlocks(context)
  return {
    subject: subjectFor(context.kind, context.locale),
    text: renderText(blocks, context.locale),
    html: renderHtml(blocks),
  }
}
