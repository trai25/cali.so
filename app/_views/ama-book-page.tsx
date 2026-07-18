import type { Metadata } from 'next'

import { BookingFlow } from '~/components/ama/booking-flow'
import { PixelCluster } from '~/components/pixel-cluster'
import { T } from '~/lib/i18n'
import { localeMetadata } from '~/lib/locale-metadata'
import type { Locale } from '~/lib/locale-route'

export function amaBookMetadata(locale: Locale): Metadata {
  return {
    ...localeMetadata({
      locale,
      path: '/ama/book',
      title: locale === 'en' ? 'Book an AMA Session' : '预订 AMA 时间',
      description:
        locale === 'en'
          ? 'Pick a time for a 60 minute one-to-one AMA Session with Cali.'
          : '选一个时间，与 Cali 进行 60 分钟的一对一 AMA。',
    }),
    // The booking flow is transactional: crawlers get the editorial /ama page.
    robots: { index: false, follow: false },
  }
}

export function AmaBookPageView() {
  return (
    <div className="mx-auto w-full max-w-[37.5rem] px-6">
      <div className="flex items-start justify-between gap-4">
        <header className="max-w-[34rem]">
          <h1 className="page-eyebrow enter">
            <T zh="预订时间" en="Book an AMA Session" />
          </h1>
          <p
            className="page-introduction enter mt-4 text-balance"
            style={{ '--enter-delay': '70ms' } as React.CSSProperties}
          >
            <T
              zh="选一个时间，介绍一下你自己，然后付款。整个过程大约三分钟。"
              en="Pick a time, introduce yourself, then pay. The whole thing takes about three minutes."
            />
          </p>
        </header>
        <PixelCluster className="enter shrink-0" />
      </div>

      <div className="enter mt-10 pb-4" style={{ '--enter-delay': '120ms' } as React.CSSProperties}>
        <BookingFlow />
      </div>
    </div>
  )
}
