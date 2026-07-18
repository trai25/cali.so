/** @vitest-environment jsdom */

import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { ZoomImage } from './zoom-image'

vi.mock('next/image', () => ({
  default: (props: React.ImgHTMLAttributes<HTMLImageElement>) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img {...props} />
  ),
}))

vi.mock('~/lib/locale-client', () => ({
  localize: (_locale: string, _zh: string, en: string) => en,
  useLocale: () => 'en',
}))

let reducedMotion = false

beforeEach(() => {
  reducedMotion = false
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => ({ matches: reducedMotion }) as MediaQueryList),
  )
  vi.stubGlobal('requestAnimationFrame', vi.fn(() => 1))
  vi.stubGlobal('cancelAnimationFrame', vi.fn())

  Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1200 })
  Object.defineProperty(window, 'innerHeight', { configurable: true, value: 900 })
  vi.spyOn(HTMLImageElement.prototype, 'getBoundingClientRect').mockReturnValue({
    bottom: 300,
    height: 200,
    left: 100,
    right: 400,
    top: 100,
    width: 300,
    x: 100,
    y: 100,
    toJSON: () => ({}),
  })
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('ZoomImage', () => {
  it('opens keyboard activation in its settled state without scheduling motion', () => {
    render(<ZoomImage src="/photo.jpg" alt="Taipei" width={800} height={600} />)

    fireEvent.click(screen.getByRole('button', { name: 'Zoom image: Taipei' }), {
      detail: 0,
    })

    expect(
      screen.getByRole('dialog', { name: 'Taipei' }).getAttribute('data-state'),
    ).toBe('open')
    expect(requestAnimationFrame).not.toHaveBeenCalled()
  })

  it('closes on Escape immediately and restores trigger focus', () => {
    render(<ZoomImage src="/photo.jpg" alt="Taipei" width={800} height={600} />)
    const trigger = screen.getByRole('button', { name: 'Zoom image: Taipei' })
    trigger.focus()
    fireEvent.click(trigger, { detail: 0 })

    const escape = new KeyboardEvent('keydown', {
      bubbles: true,
      cancelable: true,
      key: 'Escape',
    })
    act(() => {
      window.dispatchEvent(escape)
    })

    expect(escape.defaultPrevented).toBe(true)
    expect(screen.queryByRole('dialog', { name: 'Taipei' })).toBeNull()
    expect(document.activeElement).toBe(trigger)
  })

  it('preserves the two-frame pointer opening transition', () => {
    const frames: FrameRequestCallback[] = []
    vi.stubGlobal(
      'requestAnimationFrame',
      vi.fn((callback: FrameRequestCallback) => {
        frames.push(callback)
        return frames.length
      }),
    )
    render(<ZoomImage src="/photo.jpg" alt="Taipei" width={800} height={600} />)

    fireEvent.click(screen.getByRole('button', { name: 'Zoom image: Taipei' }), {
      detail: 1,
    })

    const dialog = screen.getByRole('dialog', { name: 'Taipei' })
    expect(dialog.getAttribute('data-state')).toBe('opening')
    expect(frames).toHaveLength(1)

    act(() => frames.shift()?.(0))
    expect(dialog.getAttribute('data-state')).toBe('opening')
    expect(frames).toHaveLength(1)

    act(() => frames.shift()?.(16))
    expect(dialog.getAttribute('data-state')).toBe('open')
  })

  it('keeps pointer overlay closing animated until the image settles', () => {
    const frames: FrameRequestCallback[] = []
    vi.stubGlobal(
      'requestAnimationFrame',
      vi.fn((callback: FrameRequestCallback) => {
        frames.push(callback)
        return frames.length
      }),
    )
    render(<ZoomImage src="/photo.jpg" alt="Taipei" width={800} height={600} />)
    const trigger = screen.getByRole('button', { name: 'Zoom image: Taipei' })
    trigger.focus()
    fireEvent.click(trigger, { detail: 1 })
    act(() => frames.shift()?.(0))
    act(() => frames.shift()?.(16))

    const dialog = screen.getByRole('dialog', { name: 'Taipei' })
    fireEvent.click(dialog, { detail: 1 })

    expect(dialog.getAttribute('data-state')).toBe('closing')
    fireEvent.transitionEnd(dialog.querySelector('img')!)
    expect(screen.queryByRole('dialog', { name: 'Taipei' })).toBeNull()
    expect(document.activeElement).toBe(trigger)
  })

  it('bypasses pointer closing motion when Escape is pressed', () => {
    const frames: FrameRequestCallback[] = []
    vi.stubGlobal(
      'requestAnimationFrame',
      vi.fn((callback: FrameRequestCallback) => {
        frames.push(callback)
        return frames.length
      }),
    )
    render(<ZoomImage src="/photo.jpg" alt="Taipei" width={800} height={600} />)
    const trigger = screen.getByRole('button', { name: 'Zoom image: Taipei' })
    fireEvent.click(trigger, { detail: 1 })
    act(() => frames.shift()?.(0))
    act(() => frames.shift()?.(16))

    fireEvent.keyDown(window, { key: 'Escape' })

    expect(screen.queryByRole('dialog', { name: 'Taipei' })).toBeNull()
    expect(document.activeElement).toBe(trigger)
  })

  it('settles reduced-motion pointer activation and dismissal immediately', () => {
    reducedMotion = true
    render(<ZoomImage src="/photo.jpg" alt="Taipei" width={800} height={600} />)
    const trigger = screen.getByRole('button', { name: 'Zoom image: Taipei' })
    trigger.focus()

    fireEvent.click(trigger, { detail: 1 })

    const dialog = screen.getByRole('dialog', { name: 'Taipei' })
    expect(dialog.getAttribute('data-state')).toBe('open')
    expect(requestAnimationFrame).not.toHaveBeenCalled()

    fireEvent.click(dialog, { detail: 1 })
    expect(screen.queryByRole('dialog', { name: 'Taipei' })).toBeNull()
    expect(document.activeElement).toBe(trigger)
  })

  it('removes every viewport and keyboard listener when unmounted', () => {
    const removeListener = vi.spyOn(window, 'removeEventListener')
    const { unmount } = render(
      <ZoomImage src="/photo.jpg" alt="Taipei" width={800} height={600} />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Zoom image: Taipei' }), {
      detail: 0,
    })

    unmount()

    for (const type of ['keydown', 'wheel', 'touchmove', 'resize']) {
      expect(removeListener.mock.calls.some(([removedType]) => removedType === type)).toBe(
        true,
      )
    }
  })
})
