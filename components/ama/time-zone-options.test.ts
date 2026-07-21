import { describe, expect, it } from 'vitest'

import { listTimeZoneOptions } from './time-zone-options'

describe('listTimeZoneOptions', () => {
  it('keeps a detected zone distinct from a curated zone with the same current offset', () => {
    const options = listTimeZoneOptions('America/Phoenix', ['2026-08-03T12:00:00.000Z'])

    expect(options.some((option) => option.zone === 'America/Los_Angeles')).toBe(true)
    expect(options.find((option) => option.zone === 'America/Phoenix')?.en).toContain('Phoenix')
  })

  it('labels every offset represented by slots across a daylight-saving change', () => {
    const options = listTimeZoneOptions('America/New_York', [
      '2026-10-30T12:00:00.000Z',
      '2026-11-05T12:00:00.000Z',
    ])

    expect(options.find((option) => option.zone === 'America/New_York')?.en).toContain(
      'UTC-4 / UTC-5',
    )
  })
})
