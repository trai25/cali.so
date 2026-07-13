import { formatDate, SITE_TIME_ZONE } from '~/lib/date'

// Bilingual chrome without routes or hydration risk: both languages are
// in the static DOM; CSS shows one based on html[data-locale], which a
// pre-paint script restores from localStorage (default zh). Post content
// stays in its own language — this is for chrome strings only.
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
