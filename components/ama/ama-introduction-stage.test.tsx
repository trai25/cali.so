// @vitest-environment jsdom

import { act, cleanup, fireEvent, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { AmaIntroductionStage } from './ama-introduction-stage'

vi.mock('next/dynamic', () => ({
  default: () =>
    function ConversationFieldBoundary({ onReady }: { onReady: () => void }) {
      return (
        <button type="button" data-conversation-shader-ready onClick={onReady}>
          Mark conversation shader ready
        </button>
      )
    },
}))

function setReducedMotion(initial = false) {
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => ({
      matches: initial,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  )
}

function setWebGpu(adapter: unknown | null) {
  const requestAdapter = vi.fn().mockResolvedValue(adapter)
  Object.defineProperty(navigator, 'gpu', {
    configurable: true,
    value: { requestAdapter },
  })
  return requestAdapter
}

function setIntersectionObserver() {
  let callback: IntersectionObserverCallback = () => undefined
  const disconnect = vi.fn()
  const observe = vi.fn()
  class IntersectionObserverMock {
    disconnect = disconnect
    observe = observe
    unobserve = vi.fn()

    constructor(nextCallback: IntersectionObserverCallback) {
      callback = nextCallback
    }
  }
  vi.stubGlobal('IntersectionObserver', IntersectionObserverMock)
  return {
    disconnect,
    observe,
    set(isIntersecting: boolean) {
      act(() => {
        callback(
          [{ isIntersecting } as IntersectionObserverEntry],
          {} as IntersectionObserver,
        )
      })
    },
  }
}

async function flush() {
  await act(async () => {
    await Promise.resolve()
    await Promise.resolve()
  })
}

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  Reflect.deleteProperty(navigator, 'gpu')
})

describe('AmaIntroductionStage', () => {
  it('runs one shader only while the bounded field is visible', async () => {
    setReducedMotion()
    const requestAdapter = setWebGpu({})
    const intersection = setIntersectionObserver()
    const { container } = render(
      <AmaIntroductionStage>
        <p>AMA introduction</p>
      </AmaIntroductionStage>,
    )

    await flush()

    expect(requestAdapter).toHaveBeenCalledOnce()
    expect(intersection.observe).toHaveBeenCalledOnce()
    expect(container.querySelector('.ama-conversation-static')).not.toBeNull()
    expect(
      container.querySelectorAll('[data-conversation-shader-ready]').length,
    ).toBe(1)

    fireEvent.click(container.querySelector('[data-conversation-shader-ready]')!)
    expect(
      container.querySelector('[data-ama-introduction-stage]')?.getAttribute(
        'data-shader-ready',
      ),
    ).toBe('true')

    intersection.set(false)
    expect(container.querySelector('[data-conversation-shader-ready]')).toBeNull()
    expect(
      container.querySelector('[data-ama-introduction-stage]')?.getAttribute(
        'data-in-viewport',
      ),
    ).toBe('false')

    intersection.set(true)
    await flush()
    expect(container.querySelector('[data-conversation-shader-ready]')).not.toBeNull()
  })

  it('keeps the static field and skips WebGPU under reduced motion', async () => {
    setReducedMotion(true)
    const requestAdapter = setWebGpu({})
    setIntersectionObserver()
    const { container } = render(
      <AmaIntroductionStage>
        <p>AMA introduction</p>
      </AmaIntroductionStage>,
    )

    await flush()

    expect(requestAdapter).not.toHaveBeenCalled()
    expect(container.querySelector('.ama-conversation-static')).not.toBeNull()
    expect(container.querySelector('[data-conversation-shader-ready]')).toBeNull()
  })
})
