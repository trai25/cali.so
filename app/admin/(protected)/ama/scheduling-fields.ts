export const AMA_WEEKDAYS = [
  { value: 1, zh: '星期一', en: 'Monday' },
  { value: 2, zh: '星期二', en: 'Tuesday' },
  { value: 3, zh: '星期三', en: 'Wednesday' },
  { value: 4, zh: '星期四', en: 'Thursday' },
  { value: 5, zh: '星期五', en: 'Friday' },
  { value: 6, zh: '星期六', en: 'Saturday' },
  { value: 7, zh: '星期日', en: 'Sunday' },
] as const

export function formatScheduleMinute(minute: number) {
  if (minute === 24 * 60) return '24:00'
  const hour = Math.floor(minute / 60)
  return `${hour.toString().padStart(2, '0')}:${(minute % 60).toString().padStart(2, '0')}`
}

export function parseScheduleMinute(value: string) {
  if (value === '24:00') return 24 * 60
  const [hour, minute] = value.split(':').map(Number)
  return hour * 60 + minute
}

function timeOptions(firstMinute: number, lastMinute: number) {
  const options: number[] = []
  for (let minute = firstMinute; minute <= lastMinute; minute += 30) {
    options.push(minute)
  }
  return options
}

export const AMA_START_OPTIONS = timeOptions(0, 23 * 60 + 30)
export const AMA_END_OPTIONS = timeOptions(30, 24 * 60)
