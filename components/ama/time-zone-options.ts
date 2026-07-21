/**
 * One curated zone per populous UTC offset, so the list stays well under 20
 * rows instead of the ~400-zone IANA list. Every city listed on a row must
 * observe that row's IANA zone rules exactly across the visible slot dates.
 */
const CURATED_ZONES: { zone: string; zh: string[]; en: string[] }[] = [
  { zone: 'America/Los_Angeles', zh: ['洛杉矶', '温哥华', '旧金山'], en: ['Los Angeles', 'Vancouver', 'San Francisco'] },
  { zone: 'America/Denver', zh: ['丹佛', '盐湖城'], en: ['Denver', 'Salt Lake City'] },
  { zone: 'America/Chicago', zh: ['芝加哥', '达拉斯', '休斯顿'], en: ['Chicago', 'Dallas', 'Houston'] },
  { zone: 'America/New_York', zh: ['纽约', '多伦多', '迈阿密'], en: ['New York', 'Toronto', 'Miami'] },
  { zone: 'America/Sao_Paulo', zh: ['圣保罗', '布宜诺斯艾利斯'], en: ['São Paulo', 'Buenos Aires'] },
  { zone: 'Europe/London', zh: ['伦敦', '里斯本', '都柏林'], en: ['London', 'Lisbon', 'Dublin'] },
  { zone: 'Europe/Paris', zh: ['巴黎', '柏林', '阿姆斯特丹'], en: ['Paris', 'Berlin', 'Amsterdam'] },
  { zone: 'Europe/Athens', zh: ['雅典', '赫尔辛基'], en: ['Athens', 'Helsinki'] },
  { zone: 'Europe/Istanbul', zh: ['伊斯坦布尔', '莫斯科', '利雅得'], en: ['Istanbul', 'Moscow', 'Riyadh'] },
  { zone: 'Asia/Dubai', zh: ['迪拜', '阿布扎比'], en: ['Dubai', 'Abu Dhabi'] },
  { zone: 'Asia/Karachi', zh: ['卡拉奇', '伊斯兰堡'], en: ['Karachi', 'Islamabad'] },
  { zone: 'Asia/Kolkata', zh: ['新德里', '孟买', '班加罗尔'], en: ['New Delhi', 'Mumbai', 'Bengaluru'] },
  { zone: 'Asia/Dhaka', zh: ['达卡'], en: ['Dhaka'] },
  { zone: 'Asia/Bangkok', zh: ['曼谷', '雅加达', '胡志明市'], en: ['Bangkok', 'Jakarta', 'Ho Chi Minh City'] },
  { zone: 'Asia/Shanghai', zh: ['北京', '新加坡', '香港'], en: ['Beijing', 'Singapore', 'Hong Kong'] },
  { zone: 'Asia/Tokyo', zh: ['东京', '首尔'], en: ['Tokyo', 'Seoul'] },
  { zone: 'Australia/Sydney', zh: ['悉尼', '墨尔本', '堪培拉'], en: ['Sydney', 'Melbourne', 'Canberra'] },
  { zone: 'Pacific/Auckland', zh: ['奥克兰', '惠灵顿'], en: ['Auckland', 'Wellington'] },
]

function zoneOffsetMinutes(zone: string, date: Date): number | null {
  try {
    const value = new Intl.DateTimeFormat('en-US', {
      timeZone: zone,
      timeZoneName: 'longOffset',
    })
      .formatToParts(date)
      .find((part) => part.type === 'timeZoneName')?.value
    if (!value) return null
    if (value === 'GMT' || value === 'UTC') return 0
    const match = value.match(/GMT([+-])(\d{1,2})(?::(\d{2}))?/)
    if (!match) return null
    const sign = match[1] === '-' ? -1 : 1
    return sign * (Number(match[2]) * 60 + Number(match[3] ?? 0))
  } catch {
    return null
  }
}

function offsetLabel(minutes: number): string {
  const sign = minutes < 0 ? '-' : '+'
  const abs = Math.abs(minutes)
  const remainder = abs % 60
  return `UTC${sign}${Math.floor(abs / 60)}${remainder ? `:${String(remainder).padStart(2, '0')}` : ''}`
}

function fallbackCity(zone: string): string {
  return (zone.split('/').pop() ?? zone).replace(/_/g, ' ')
}

export type TimeZoneOption = { zone: string; zh: string; en: string }

function offsetsForDates(zone: string, dates: Date[]): number[] {
  const offsets = dates
    .map((date) => zoneOffsetMinutes(zone, date))
    .filter((offset): offset is number => offset !== null)
  return [...new Set(offsets)]
}

/**
 * Labels reflect every offset present in the visible slots. A detected zone
 * is appended as its own row instead of replacing a same-offset curated zone,
 * because their daylight-saving rules can diverge later.
 */
export function listTimeZoneOptions(
  selected: string,
  slotInstants: readonly string[],
): TimeZoneOption[] {
  const parsedDates = slotInstants
    .map((instant) => new Date(instant))
    .filter((date) => !Number.isNaN(date.getTime()))
  const dates = parsedDates.length > 0 ? parsedDates : [new Date()]
  const zones = CURATED_ZONES.map((curated) => ({ ...curated }))

  if (!zones.some((row) => row.zone === selected)) {
    const city = fallbackCity(selected)
    zones.push({ zone: selected, zh: [city], en: [city] })
  }

  return zones
    .flatMap((row) => {
      const offsets = offsetsForDates(row.zone, dates)
      if (offsets.length === 0) return []
      const offsetSummary = offsets.map(offsetLabel).join(' / ')
      return [{ ...row, offsets, offsetSummary }]
    })
    .sort((a, b) => a.offsets[0]! - b.offsets[0]!)
    .map((row) => ({
      zone: row.zone,
      zh: `${row.offsetSummary} · ${row.zh.join(' / ')}`,
      en: `${row.offsetSummary} · ${row.en.join(' / ')}`,
    }))
}
