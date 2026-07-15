import { describe, expect, it } from 'vitest'

import { getAllPosts, isPostSlug } from './content'

describe('post slug allowlist', () => {
  it('accepts published slugs and rejects unknown or traversal-shaped values', () => {
    for (const post of getAllPosts()) expect(isPostSlug(post.slug)).toBe(true)

    expect(isPostSlug('not-a-published-post')).toBe(false)
    expect(isPostSlug('../newsletters')).toBe(false)
  })
})
