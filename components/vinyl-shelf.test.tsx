/** @vitest-environment jsdom */

import { cleanup, fireEvent, render } from '@testing-library/react'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

import { VinylShelf } from './vinyl-shelf'

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

const originalPointerCapture = {
  has: HTMLElement.prototype.hasPointerCapture,
  release: HTMLElement.prototype.releasePointerCapture,
  set: HTMLElement.prototype.setPointerCapture,
}

beforeAll(() => {
  const capturedPointers = new WeakMap<HTMLElement, Set<number>>()

  HTMLElement.prototype.setPointerCapture = vi.fn(function (this: HTMLElement, pointerId: number) {
    const captured = capturedPointers.get(this) ?? new Set<number>()
    captured.add(pointerId)
    capturedPointers.set(this, captured)
  })
  HTMLElement.prototype.hasPointerCapture = vi.fn(function (this: HTMLElement, pointerId: number) {
    return capturedPointers.get(this)?.has(pointerId) ?? false
  })
  HTMLElement.prototype.releasePointerCapture = vi.fn(function (this: HTMLElement, pointerId: number) {
    capturedPointers.get(this)?.delete(pointerId)
  })
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

afterAll(() => {
  HTMLElement.prototype.setPointerCapture = originalPointerCapture.set
  HTMLElement.prototype.hasPointerCapture = originalPointerCapture.has
  HTMLElement.prototype.releasePointerCapture = originalPointerCapture.release
})

describe('VinylShelf', () => {
  it('keeps a mobile horizontal swipe and snaps to the next sleeve', () => {
    vi.stubGlobal(
      'matchMedia',
      vi.fn(() => ({ matches: false }) as MediaQueryList),
    )
    const { container } = render(<VinylShelf />)
    const viewport = container.querySelector<HTMLElement>('.vinyl-viewport')
    const shelf = container.querySelector<HTMLElement>('.vinyl-shelf')

    expect(viewport).not.toBeNull()
    expect(shelf?.dataset.activeIndex).toBe('4')
    expect(viewport?.style.touchAction).toBe('pan-y')

    fireEvent.pointerDown(viewport!, {
      button: 0,
      clientX: 300,
      clientY: 100,
      isPrimary: true,
      pointerId: 1,
      pointerType: 'touch',
    })

    expect(viewport?.setPointerCapture).toHaveBeenCalledWith(1)

    fireEvent.pointerMove(viewport!, {
      clientX: 236,
      clientY: 100,
      isPrimary: true,
      pointerId: 1,
      pointerType: 'touch',
    })
    fireEvent.pointerUp(viewport!, {
      clientX: 236,
      clientY: 100,
      isPrimary: true,
      pointerId: 1,
      pointerType: 'touch',
    })

    expect(shelf?.dataset.activeIndex).toBe('5')
  })
})
