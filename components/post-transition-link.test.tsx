/** @vitest-environment jsdom */

import type { MouseEventHandler, ReactNode } from 'react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('next/link', () => ({
  default: ({
    children,
    onClick,
    transitionTypes,
  }: {
    children: ReactNode
    onClick?: MouseEventHandler<HTMLAnchorElement>
    transitionTypes?: string[]
  }) => (
    <a
      href="/blog/a-post"
      data-transition-types={transitionTypes?.join(',')}
      onClick={(event) => {
        onClick?.(event)
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
      screen
        .getByRole('link', { name: 'Read post' })
        .getAttribute('data-transition-types'),
    ).toBe('page-forward')

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

  it('leaves the current page unchanged for modified clicks', () => {
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
