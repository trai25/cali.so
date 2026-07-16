/** @vitest-environment jsdom */

import type { ReactNode } from 'react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('next/link', () => ({
  default: ({
    children,
    onNavigate,
  }: {
    children: ReactNode
    onNavigate?: () => void
  }) => (
    <a
      href="/blog/a-post"
      onClick={(event) => {
        if (!event.metaKey) onNavigate?.()
        event.preventDefault()
      }}
    >
      {children}
    </a>
  ),
}))

import { PostTransitionLink } from './post-transition-link'

describe('PostTransitionLink', () => {
  afterEach(() => {
    cleanup()
    document.documentElement.style.removeProperty(
      '--post-cover-transition-name',
    )
    document.documentElement.style.removeProperty(
      '--post-title-transition-name',
    )
  })

  it('carries the clicked row transition names into the destination shell', () => {
    render(
      <PostTransitionLink
        href="/blog/a-post"
        coverTransitionName="cover-p01"
        titleTransitionName="title-p01"
      >
        Read post
      </PostTransitionLink>,
    )

    fireEvent.click(screen.getByRole('link', { name: 'Read post' }))

    expect(
      document.documentElement.style.getPropertyValue(
        '--post-cover-transition-name',
      ),
    ).toBe('cover-p01')
    expect(
      document.documentElement.style.getPropertyValue(
        '--post-title-transition-name',
      ),
    ).toBe('title-p01')
  })

  it('leaves the current page unchanged when Next does not navigate', () => {
    render(
      <PostTransitionLink
        href="/blog/a-post"
        coverTransitionName="cover-p01"
        titleTransitionName="title-p01"
      >
        Open post elsewhere
      </PostTransitionLink>,
    )

    fireEvent.click(screen.getByRole('link', { name: 'Open post elsewhere' }), {
      metaKey: true,
    })

    expect(
      document.documentElement.style.getPropertyValue(
        '--post-cover-transition-name',
      ),
    ).toBe('')
    expect(
      document.documentElement.style.getPropertyValue(
        '--post-title-transition-name',
      ),
    ).toBe('')
  })
})
