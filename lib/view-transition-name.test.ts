import { describe, expect, it } from 'vitest'

import { getAllPosts } from './content'
import { postViewTransitionName } from './view-transition-name'

describe('post view-transition names', () => {
  it('rejects stored slugs that are not explicitly allowlisted', () => {
    const slug = 'a-post;view-transition-name:injected'

    expect(() => postViewTransitionName('cover', slug)).toThrow(
      'Unknown post view-transition slug',
    )
  })

  it('assigns every current post a unique safe identifier', () => {
    const names = getAllPosts().map((post) =>
      postViewTransitionName('title', post.slug),
    )

    expect(new Set(names).size).toBe(names.length)
    expect(names.every((name) => /^title-p\d{2}$/.test(name))).toBe(true)
  })
})
