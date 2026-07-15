import { describe, expect, it } from 'vitest'

import { formatDate, formatDateEn } from './date'

describe('localized long dates', () => {
  const date = new Date('2026-07-14T16:30:00.000Z')

  it('formats the same Taipei calendar day in Chinese and English', () => {
    expect(formatDate(date)).toBe('2026年7月15日')
    expect(formatDateEn(date)).toBe('July 15, 2026')
  })
})
