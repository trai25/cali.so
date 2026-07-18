'use client'

import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'

import { BookingSuccessStage } from '~/components/ama/booking-success-stage'
import { trackFunnelEvent } from '~/lib/analytics'
import { T } from '~/lib/i18n'
import { localize, useLocale } from '~/lib/locale-client'
import { localePath } from '~/lib/locale-route'

const POLL_INTERVAL_MS = 3000
/** ~2 minutes of polling before settling into the still-processing note. */
const MAX_POLLS = 40

type ConfirmationState =
  | { kind: 'missing' }
  | { kind: 'checking' }
  | { kind: 'processing' }
  | { kind: 'still-processing' }
  | { kind: 'paid'; bookingStatus: 'finalizing' | 'confirmed' | 'needs_reschedule' }
  | { kind: 'expired' }
  | { kind: 'cancelled' }

function isTerminal(state: ConfirmationState) {
  return state.kind === 'missing' || state.kind === 'paid' || state.kind === 'expired' || state.kind === 'cancelled'
}

/**
 * The post-checkout landing. It never claims success it cannot prove: the
 * page reflects the server's hold state and keeps polling while payment is
 * being confirmed.
 */
export function BookingConfirmation() {
  const locale = useLocale()
  const searchParams = useSearchParams()
  const holdId = searchParams.get('hold')
  const [state, setState] = useState<ConfirmationState>(
    holdId ? { kind: 'checking' } : { kind: 'missing' },
  )
  const paidTrackedRef = useRef(false)
  const pollCountRef = useRef(0)

  useEffect(() => {
    if (!holdId) return
    let cancelled = false
    let timer: number | undefined

    async function poll() {
      pollCountRef.current += 1
      let next: ConfirmationState = { kind: 'processing' }
      try {
        const response = await fetch(`/api/ama/holds/${holdId}`)
        if (response.status === 404) {
          next = { kind: 'missing' }
        } else if (response.ok) {
          const body = (await response.json()) as {
            hold:
              | { state: 'active' | 'processing' | 'expired' | 'cancelled' }
              | { state: 'paid'; bookingStatus: 'finalizing' | 'confirmed' | 'needs_reschedule' }
          }
          if (body.hold.state === 'paid') {
            next = { kind: 'paid', bookingStatus: body.hold.bookingStatus }
          } else if (body.hold.state === 'expired') {
            next = { kind: 'expired' }
          } else if (body.hold.state === 'cancelled') {
            next = { kind: 'cancelled' }
          } else {
            // active or processing: the payment may still be settling.
            next = { kind: 'processing' }
          }
        }
      } catch {
        next = { kind: 'processing' }
      }

      if (cancelled) return

      if (next.kind === 'processing' && pollCountRef.current >= MAX_POLLS) {
        setState({ kind: 'still-processing' })
        return
      }

      setState(next)
      if (next.kind === 'paid' && !paidTrackedRef.current) {
        paidTrackedRef.current = true
        trackFunnelEvent('ama_booking_paid')
      }
      if (!isTerminal(next)) {
        timer = window.setTimeout(() => void poll(), POLL_INTERVAL_MS)
      }
    }

    void poll()
    return () => {
      cancelled = true
      if (timer !== undefined) window.clearTimeout(timer)
    }
  }, [holdId])

  if (state.kind === 'missing') {
    return (
      <div role="status" className="flex flex-col gap-4">
        <p className="text-sm font-medium">
          <T zh="这里没有可以显示的内容。" en="Nothing to show here." />
        </p>
        <p className="text-sm leading-6 text-muted-foreground">
          <T
            zh="这个链接没有对应的预订记录，可能已经过期或输入有误。"
            en="This link does not match a booking. It may have expired or been mistyped."
          />
        </p>
        <p className="text-sm">
          <Link
            href={localePath(locale, '/ama')}
            className="text-muted-foreground underline decoration-dotted underline-offset-4 transition-colors duration-150 hover:text-foreground"
          >
            <T zh="回到 AMA 介绍页" en="Back to the AMA page" />
          </Link>
        </p>
      </div>
    )
  }

  if (state.kind === 'checking' || state.kind === 'processing') {
    return (
      <div role="status" aria-live="polite" className="flex flex-col gap-3">
        <p className="text-sm font-medium">
          <span aria-hidden className="ama-waiting-dots">
            <T zh="正在确认你的付款" en="Confirming your payment" />
          </span>
          <span className="sr-only">
            {localize(locale, '正在确认你的付款。', 'Confirming your payment.')}
          </span>
        </p>
        <p className="text-sm leading-6 text-muted-foreground">
          <T
            zh="这通常只需要几秒钟。这个页面会自动更新，请不要重复付款。"
            en="This usually takes a few seconds. The page updates by itself; there is no need to pay again."
          />
        </p>
      </div>
    )
  }

  if (state.kind === 'still-processing') {
    return (
      <div role="status" className="flex flex-col gap-3">
        <p className="text-sm font-medium">
          <T zh="付款还在确认中。" en="Your payment is still being confirmed." />
        </p>
        <p className="text-sm leading-6 text-muted-foreground">
          <T
            zh="不用一直守着这个页面。一旦确认完成，确认邮件和管理链接会发到你的邮箱。"
            en="You do not need to keep this page open. Once it settles, the confirmation email and your Manage Link will arrive in your inbox."
          />
        </p>
      </div>
    )
  }

  if (state.kind === 'expired') {
    return (
      <div role="status" className="flex flex-col gap-4">
        <p className="text-sm font-medium">
          <T zh="时间保留已到期，没有产生付款。" en="The hold expired without a payment." />
        </p>
        <p className="text-sm leading-6 text-muted-foreground">
          <T
            zh="你没有被收取任何费用。想继续的话，重新选一个时间就好。"
            en="You were not charged. If you still want the session, just pick a new time."
          />
        </p>
        <p className="text-sm">
          <Link
            href={localePath(locale, '/ama/book')}
            className="text-muted-foreground underline decoration-dotted underline-offset-4 transition-colors duration-150 hover:text-foreground"
          >
            <T zh="重新选择时间" en="Pick a new time" />
          </Link>
        </p>
      </div>
    )
  }

  if (state.kind === 'cancelled') {
    return (
      <div role="status" className="flex flex-col gap-4">
        <p className="text-sm font-medium">
          <T zh="这次预订已取消。" en="This booking was cancelled." />
        </p>
        <p className="text-sm">
          <Link
            href={localePath(locale, '/ama/book')}
            className="text-muted-foreground underline decoration-dotted underline-offset-4 transition-colors duration-150 hover:text-foreground"
          >
            <T zh="重新选择时间" en="Pick a new time" />
          </Link>
        </p>
      </div>
    )
  }

  // paid
  if (state.bookingStatus === 'needs_reschedule') {
    return (
      <div role="status" className="flex flex-col gap-3">
        <p className="text-sm font-medium">
          <T zh="付款已确认，但这个时间刚刚被订走了。" en="Payment confirmed, but that time was taken while you paid." />
        </p>
        <p className="text-sm leading-6 text-muted-foreground">
          <T
            zh="抱歉。一封带有专属管理链接的邮件正在路上，你可以用它免费改到一个新时间。如果没有合适的时间，也可以通过它取消并全额退款。"
            en="Sorry about that. An email with your private Manage Link is on its way so you can pick a new time at no charge. If nothing fits, the same link cancels with a full refund."
          />
        </p>
      </div>
    )
  }

  return (
    <BookingSuccessStage>
      <div role="status" className="flex flex-col gap-3">
        <p className="text-sm font-medium">
          <T zh="付款已确认。" en="Payment confirmed." />
        </p>
        {state.bookingStatus === 'finalizing' ? (
          <p className="text-sm leading-6 text-muted-foreground">
            <T
              zh="会议细节正在生成，确认邮件很快就到。日历邀请、会议链接和管理链接都会发到你的邮箱。"
              en="Your meeting details are being finalized; the confirmation email is on its way. The calendar invite, meeting link, and your Manage Link all arrive by email."
            />
          </p>
        ) : (
          <p className="text-sm leading-6 text-muted-foreground">
            <T
              zh="确认邮件已经出发，里面有日历邀请、会议链接和专属管理链接。到时见。"
              en="A confirmation email is on its way with the calendar invite, meeting link, and your private Manage Link. See you then."
            />
          </p>
        )}
      </div>
    </BookingSuccessStage>
  )
}
