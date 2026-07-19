// @vitest-environment jsdom

import { cleanup, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { DitheredImage } from './dither-veil'

vi.mock('next/image', async () => {
  const { forwardRef } = await import('react')

  return {
    default: forwardRef<
      HTMLImageElement,
      React.ImgHTMLAttributes<HTMLImageElement> & {
        src: string | { src: string }
      }
    >(function MockImage({ src, ...props }, ref) {
      return (
        <img
          {...props}
          ref={ref}
          src={typeof src === 'string' ? src : src.src}
        />
      )
    }),
  }
})

class ResizeObserverStub {
  observe() {}
  disconnect() {}
}

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', ResizeObserverStub)
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
    {} as CanvasRenderingContext2D,
  )
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('DitheredImage', () => {
  it('samples the rendered optimized image without creating another request', () => {
    const imageConstructor = vi.fn()
    vi.stubGlobal('Image', imageConstructor)

    const { container } = render(
      <DitheredImage
        src="/_next/image?url=%2Fcover.png&w=128&q=75"
        alt=""
        width={64}
        height={44}
      />,
    )

    expect(container.querySelectorAll('img')).toHaveLength(1)
    expect(imageConstructor).not.toHaveBeenCalled()
  })
})
