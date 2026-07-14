import { describe, expect, it } from 'vitest'

import { getAllPosts } from './content'
import { postViewTransitionName } from './view-transition-name'

describe('post view-transition names', () => {
  it('produces deterministic CSS identifiers without embedding the slug', () => {
    const slug = 'a-post;view-transition-name:injected'
    const first = postViewTransitionName('cover', slug)

    expect(first).toBe(postViewTransitionName('cover', slug))
    expect(first).toMatch(/^cover-p[a-z0-9]+$/)
    expect(first).not.toContain(slug)
  })

  it('keeps every current post transition name unique', () => {
    const names = getAllPosts().map((post) => postViewTransitionName('title', post.slug))

    expect(new Set(names).size).toBe(names.length)
  })
})
