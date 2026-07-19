import { describe, expect, it } from 'vitest'

import { getAllPosts, getRelatedPosts, isPostSlug } from './content'

describe('post slug allowlist', () => {
  it('accepts published slugs and rejects unknown or traversal-shaped values', () => {
    for (const post of getAllPosts()) expect(isPostSlug(post.slug)).toBe(true)

    expect(isPostSlug('not-a-published-post')).toBe(false)
    expect(isPostSlug('../newsletters')).toBe(false)
  })
})

describe('posts like this', () => {
  it('returns up to three published posts, never the post itself, deterministically', () => {
    for (const post of getAllPosts()) {
      const related = getRelatedPosts(post.slug)

      expect(related.length).toBeGreaterThan(0)
      expect(related.length).toBeLessThanOrEqual(3)
      expect(related.map((entry) => entry.slug)).not.toContain(post.slug)
      expect(new Set(related.map((entry) => entry.slug)).size).toBe(related.length)
      // stable ranking: the same input always yields the same list
      expect(getRelatedPosts(post.slug).map((entry) => entry.slug)).toEqual(
        related.map((entry) => entry.slug),
      )
    }

    expect(getRelatedPosts('not-a-published-post')).toEqual([])
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
