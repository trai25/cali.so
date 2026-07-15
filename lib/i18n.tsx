import { formatDate, SITE_TIME_ZONE } from '~/lib/date'

// Shared chrome keeps both languages in the static DOM; explicit public
// routes set html[data-locale] before paint (/ is Chinese, /en is English).
// Only the isolated admin root restores its in-place preference from storage.
export function T({ zh, en }: { zh: React.ReactNode; en: React.ReactNode }) {
  return (
    <>
      <span data-zh>{zh}</span>
      <span data-en>{en}</span>
    </>
  )
}

const enFormatter = new Intl.DateTimeFormat('en-US', {
  year: 'numeric',
  month: 'short',
  day: 'numeric',
  timeZone: SITE_TIME_ZONE,
})

export function LocalDate({ date }: { date: Date }) {
  return <T zh={formatDate(date)} en={enFormatter.format(date)} />
}
