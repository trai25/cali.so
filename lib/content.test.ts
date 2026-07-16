import { describe, expect, it } from 'vitest'

import { getAllPosts, isPostSlug } from './content'

describe('post slug allowlist', () => {
  it('accepts published slugs and rejects unknown or traversal-shaped values', () => {
    for (const post of getAllPosts()) expect(isPostSlug(post.slug)).toBe(true)

    expect(isPostSlug('not-a-published-post')).toBe(false)
    expect(isPostSlug('../newsletters')).toBe(false)
  })
})

describe('public post metadata', () => {
  it('fits localized titles and descriptions within social preview budgets', () => {
    for (const post of getAllPosts()) {
      expect(`${post.title} | Cali Castle`.length, post.slug).toBeLessThanOrEqual(70)
      expect(`${post.titleEn} | Cali Castle`.length, post.slug).toBeLessThanOrEqual(70)
      expect(post.description?.length ?? 0, post.slug).toBeGreaterThan(0)
      expect(post.description?.length ?? 0, post.slug).toBeLessThanOrEqual(80)
      expect(post.descriptionEn.length, post.slug).toBeGreaterThan(0)
      expect(post.descriptionEn.length, post.slug).toBeLessThanOrEqual(160)
    }
  })
})
