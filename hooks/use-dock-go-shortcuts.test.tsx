// @vitest-environment jsdom

import { cleanup, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { useDockGoShortcuts } from './use-dock-go-shortcuts'

const push = vi.fn()
const playDockSound = vi.fn()

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
}))

vi.mock('~/lib/sound', () => ({
  playDockSound: () => playDockSound(),
}))

function Harness({
  locale = 'zh' as const,
  activeHref = '/' as string | undefined,
  onNavigate,
}: {
  locale?: 'zh' | 'en'
  activeHref?: string | undefined
  onNavigate?: (href: string, keyboardInitiated: boolean) => void
}) {
  useDockGoShortcuts({ locale, activeHref, onNavigate })
  return null
}

function keydown(key: string, target: HTMLElement = document.body) {
  target.dispatchEvent(
    new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }),
  )
}

afterEach(() => {
  cleanup()
  push.mockClear()
  playDockSound.mockClear()
  vi.useRealTimers()
})

beforeEach(() => {
  vi.useFakeTimers()
})

describe('useDockGoShortcuts', () => {
  it('navigates with G then letter chords', () => {
    const onNavigate = vi.fn()
    render(<Harness activeHref="/blog" onNavigate={onNavigate} />)

    keydown('g')
    keydown('h')

    expect(onNavigate).toHaveBeenCalledWith('/', true)
    expect(playDockSound).toHaveBeenCalledOnce()
    expect(push).toHaveBeenCalledWith('/')
  })

  it.each([
    { key: 'w', href: '/en/blog' },
    { key: 'p', href: '/en/photos' },
    { key: 'j', href: '/en/projects' },
    { key: 'a', href: '/en/ama' },
  ] as const)('maps G then $key to $href', ({ key, href }) => {
    render(<Harness locale="en" activeHref="/" />)

    keydown('g')
    keydown(key)

    expect(push).toHaveBeenCalledWith(href)
    expect(playDockSound).toHaveBeenCalledOnce()
  })

  it('ignores chords while typing in inputs', () => {
    render(<Harness />)
    const input = document.createElement('input')
    document.body.append(input)

    keydown('g', input)
    keydown('h', input)

    expect(push).not.toHaveBeenCalled()
    input.remove()
  })

  it('expires a pending G after the chord window', () => {
    render(<Harness />)

    keydown('g')
    vi.advanceTimersByTime(1000)
    keydown('h')

    expect(push).not.toHaveBeenCalled()
  })

  it('skips the dock sound when already on the target route', () => {
    render(<Harness activeHref="/projects" />)

    keydown('g')
    keydown('j')

    expect(push).toHaveBeenCalledWith('/projects')
    expect(playDockSound).not.toHaveBeenCalled()
  })
})
