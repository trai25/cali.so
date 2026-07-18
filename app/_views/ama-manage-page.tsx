import type { Metadata } from 'next'

import { ManageBooking } from '~/components/ama/manage-booking'
import { PixelCluster } from '~/components/pixel-cluster'
import { T } from '~/lib/i18n'
import { localeMetadata } from '~/lib/locale-metadata'
import type { Locale } from '~/lib/locale-route'

export function amaManageMetadata(locale: Locale): Metadata {
  return {
    ...localeMetadata({
      locale,
      path: '/ama/manage',
      title: locale === 'en' ? 'Manage your booking' : '管理你的预订',
      description:
        locale === 'en'
          ? 'View, reschedule, or cancel your AMA Session.'
          : '查看、改期或取消你的 AMA 预订。',
    }),
    // Manage Links are private capability URLs; they must never be indexed.
    robots: { index: false, follow: false },
  }
}

export function AmaManagePageView({ token }: { token: string }) {
  return (
    <div className="mx-auto w-full max-w-[37.5rem] px-6">
      <header className="flex items-center justify-between gap-4">
        <h1 className="page-eyebrow enter">
          <T zh="管理你的预订" en="Manage your booking" />
        </h1>
        <PixelCluster variant={2} className="enter shrink-0" />
      </header>

      <div className="enter mt-10 pb-4" style={{ '--enter-delay': '70ms' } as React.CSSProperties}>
        <ManageBooking token={token} />
      </div>
    </div>
  )
}
