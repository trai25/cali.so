import type { Metadata } from 'next'
import { Suspense } from 'react'

import { BookingConfirmation } from '~/components/ama/booking-confirmation'
import { T } from '~/lib/i18n'
import { localeMetadata } from '~/lib/locale-metadata'
import type { Locale } from '~/lib/locale-route'

export function amaConfirmationMetadata(locale: Locale): Metadata {
  return {
    ...localeMetadata({
      locale,
      path: '/ama/book/confirmation',
      title: locale === 'en' ? 'Booking confirmation' : '预订确认',
      description:
        locale === 'en'
          ? 'The status of your AMA Session payment and booking.'
          : '你的 AMA 付款与预订状态。',
    }),
    robots: { index: false, follow: false },
  }
}

function ConfirmationFallback() {
  return (
    <div role="status" aria-live="polite" className="flex flex-col gap-3">
      <p className="text-sm font-medium">
        <T zh="正在读取预订状态…" en="Checking your booking…" />
      </p>
    </div>
  )
}

export function AmaConfirmationPageView() {
  return (
    <div className="mx-auto w-full max-w-[37.5rem] px-6">
      <header className="max-w-[34rem]">
        <h1 className="enter text-sm font-medium text-muted-foreground">
          <T zh="预订确认" en="Booking confirmation" />
        </h1>
      </header>

      {/* useSearchParams requires a Suspense boundary; the fallback shares
          the client component's calm checking state so nothing jumps. */}
      <div className="enter mt-10 pb-4" style={{ '--enter-delay': '70ms' } as React.CSSProperties}>
        <Suspense fallback={<ConfirmationFallback />}>
          <BookingConfirmation />
        </Suspense>
      </div>
    </div>
  )
}
