import { describe, expect, it } from 'vitest'

import { renderBookingEmail, type BookingEmailContext } from './templates'
import type { BookingEmailKind } from './types'

const KINDS: BookingEmailKind[] = [
  'confirmation',
  'rescheduled',
  'needs_reschedule',
  'cancelled',
  'reminder_24h',
  'reminder_1h',
]

const LOCALES = ['en', 'zh'] as const

/** 2026-08-12 21:00 in Taipei, 09:00 in New York. */
const STARTS_AT = new Date('2026-08-12T13:00:00.000Z')

function buildContext(overrides: Partial<BookingEmailContext> = {}): BookingEmailContext {
  return {
    kind: 'confirmation',
    locale: 'en',
    guestName: 'Alex',
    startsAt: STARTS_AT,
    endsAt: new Date('2026-08-12T14:00:00.000Z'),
    guestTimeZone: 'Asia/Taipei',
    meetingProvider: 'google-meet',
    meetingUrl: 'https://meet.google.com/abc-defg-hij',
    manageUrl: 'https://cali.so/ama/manage/private-token-123',
    refund: null,
    ...overrides,
  }
}

function refundFor(kind: BookingEmailKind): BookingEmailContext['refund'] {
  return kind === 'cancelled' ? 'automatic' : null
}

describe('booking email templates', () => {
  for (const kind of KINDS) {
    for (const locale of LOCALES) {
      describe(`${kind} (${locale})`, () => {
        const email = renderBookingEmail(
          buildContext({ kind, locale, refund: refundFor(kind) }),
        )
        const combined = email.subject + email.text + email.html

        it('renders a non-empty subject, text, and html', () => {
          expect(email.subject.length).toBeGreaterThan(0)
          expect(email.text.length).toBeGreaterThan(0)
          expect(email.html.length).toBeGreaterThan(0)
        })

        it('contains no em or en dashes anywhere', () => {
          expect(combined).not.toMatch(/[—–]/)
        })

        it(locale === 'zh' ? 'is written in Chinese' : 'contains no Han characters', () => {
          if (locale === 'zh') {
            expect(email.subject).toMatch(/\p{Script=Han}/u)
            expect(email.text).toMatch(/\p{Script=Han}/u)
          } else {
            expect(combined).not.toMatch(/\p{Script=Han}/u)
          }
        })

        it('greets the guest by name', () => {
          expect(email.text).toContain('Alex')
          expect(email.html).toContain('Alex')
        })

        it('includes the session time, length, and time zone in the guest locale', () => {
          if (kind === 'needs_reschedule') return
          const expected = new Intl.DateTimeFormat(locale === 'zh' ? 'zh-CN' : 'en-US', {
            dateStyle: 'full',
            timeStyle: 'short',
            timeZone: 'Asia/Taipei',
          }).format(STARTS_AT)
          expect(email.text).toContain(expected)
          expect(email.text).toContain(locale === 'zh' ? '60 分钟' : '60 minutes')
        })

        it('includes the meeting link when provided', () => {
          if (kind === 'needs_reschedule' || kind === 'cancelled') return
          expect(email.text).toContain('https://meet.google.com/abc-defg-hij')
          expect(email.html).toContain('https://meet.google.com/abc-defg-hij')
        })

        it('includes the Manage Link when provided', () => {
          if (kind === 'cancelled') return
          expect(email.text).toContain('https://cali.so/ama/manage/private-token-123')
          expect(email.html).toContain('https://cali.so/ama/manage/private-token-123')
        })

        it('keeps the html table-free', () => {
          expect(email.html).not.toContain('<table')
        })
      })
    }
  }

  it('formats the same instant differently per guest time zone', () => {
    const taipei = renderBookingEmail(buildContext({ guestTimeZone: 'Asia/Taipei' }))
    const newYork = renderBookingEmail(buildContext({ guestTimeZone: 'America/New_York' }))

    expect(taipei.text).toContain('9:00 PM')
    expect(taipei.text).toContain('GMT+8')
    expect(newYork.text).toContain('9:00 AM')
    expect(newYork.text).toContain('EDT')
  })

  it('names Tencent Meeting per locale', () => {
    const en = renderBookingEmail(buildContext({ meetingProvider: 'tencent-meeting' }))
    const zh = renderBookingEmail(
      buildContext({ meetingProvider: 'tencent-meeting', locale: 'zh' }),
    )

    expect(en.text).toContain('Tencent Meeting')
    expect(en.text).not.toMatch(/\p{Script=Han}/u)
    expect(zh.text).toContain('腾讯会议')
  })

  it('explains a finalizing meeting link instead of omitting it silently', () => {
    const en = renderBookingEmail(buildContext({ meetingUrl: null }))
    const zh = renderBookingEmail(buildContext({ meetingUrl: null, locale: 'zh' }))

    expect(en.text).toContain('finalized')
    expect(en.text).toContain('calendar update')
    expect(zh.text).toContain('日历更新')
    expect(en.text).not.toContain('null')
    expect(zh.text).not.toContain('null')
  })

  it('states the 24 hour policy on confirmations', () => {
    const en = renderBookingEmail(buildContext())
    const zh = renderBookingEmail(buildContext({ locale: 'zh' }))

    expect(en.text).toContain('24 hours')
    expect(zh.text).toContain('24 小时')
  })

  it('asks the guest not to share the Manage Link', () => {
    const en = renderBookingEmail(buildContext())
    const zh = renderBookingEmail(buildContext({ locale: 'zh' }))

    expect(en.text.toLowerCase()).toContain('keep it to yourself')
    expect(zh.text).toContain('请不要分享')
  })

  it('reassures the guest that a paid Booking survives a needs_reschedule conflict', () => {
    const en = renderBookingEmail(buildContext({ kind: 'needs_reschedule' }))
    const zh = renderBookingEmail(buildContext({ kind: 'needs_reschedule', locale: 'zh' }))

    expect(en.text).toContain('Your payment went through')
    expect(en.text).toContain('https://cali.so/ama/manage/private-token-123')
    expect(zh.text).toContain('付款已经成功')
    expect(zh.text).toContain('https://cali.so/ama/manage/private-token-123')
  })

  it('confirms an automatic refund on cancellation', () => {
    const en = renderBookingEmail(buildContext({ kind: 'cancelled', refund: 'automatic' }))
    const zh = renderBookingEmail(
      buildContext({ kind: 'cancelled', refund: 'automatic', locale: 'zh' }),
    )

    expect(en.text).toContain('full refund')
    expect(en.text).toContain('original payment method')
    expect(zh.text).toContain('全额退款')
    expect(zh.text).toContain('原路退回')
  })

  it('explains the no-refund outcome on late cancellation', () => {
    const en = renderBookingEmail(buildContext({ kind: 'cancelled', refund: 'none' }))
    const zh = renderBookingEmail(
      buildContext({ kind: 'cancelled', refund: 'none', locale: 'zh' }),
    )

    expect(en.text).toContain('not automatically refunded')
    expect(en.text).toContain('24 hours')
    expect(zh.text).toContain('不提供自动退款')
    expect(zh.text).toContain('24 小时')
  })

  it('skips the Manage Link in reminders when it is absent', () => {
    for (const kind of ['reminder_24h', 'reminder_1h'] as const) {
      const email = renderBookingEmail(buildContext({ kind, manageUrl: null }))
      expect(email.text).not.toContain('Manage')
      expect(email.text).not.toContain('null')
      expect(email.text).toContain('https://meet.google.com/abc-defg-hij')
    }
  })

  it('keeps subjects free of the Booking Brief and topics', () => {
    for (const kind of KINDS) {
      for (const locale of LOCALES) {
        const email = renderBookingEmail(
          buildContext({ kind, locale, refund: refundFor(kind) }),
        )
        expect(email.subject).not.toContain('brief')
        expect(email.subject.toLowerCase()).not.toContain('topic')
      }
    }
  })

  it('escapes html-sensitive guest names in the html body only', () => {
    const email = renderBookingEmail(buildContext({ guestName: 'Alex <o&o>' }))

    expect(email.text).toContain('Alex <o&o>')
    expect(email.html).toContain('Alex &lt;o&amp;o&gt;')
    expect(email.html).not.toContain('<o&o>')
  })
})
