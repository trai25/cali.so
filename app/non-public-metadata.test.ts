import { describe, expect, it } from 'vitest'

import { nonPublicRobots } from '~/lib/non-public-metadata'

describe('non-public route metadata', () => {
  it('keeps admin, forbidden, and not-found surfaces out of indexes', () => {
    expect(nonPublicRobots).toEqual({ index: false, follow: false })
  })
})
