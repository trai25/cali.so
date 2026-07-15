import { describe, expect, it } from 'vitest'

import { getArchivedNewsletter } from './newsletters'

describe('newsletter archive', () => {
  it('reuses parsed newsletter content within the process', () => {
    const first = getArchivedNewsletter('1')
    const second = getArchivedNewsletter('1')

    expect(second).toBe(first)
  })
})
