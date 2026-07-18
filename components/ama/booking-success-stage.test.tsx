// @vitest-environment jsdom

import { act, cleanup, fireEvent, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { BookingSuccessStage } from './booking-success-stage'

vi.mock('next/dynamic', () => ({
  default: () =>
    function ShaderFieldBoundary({
      onReady,
    }: {
      onUnavailable: () => void
      onReady: () => void
    }) {
      return (
        <button type="button" data-success-shader-ready onClick={onReady}>
          Mark shader ready
        </button>
      )
    },
}))

function setReducedMotion(initial = false) {
  let reduced = initial
  const listeners = new Set<() => void>()
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => ({
      get matches() {
        return reduced
      },
      addEventListener: vi.fn((_type: string, listener: () => void) => {
        listeners.add(listener)
      }),
      removeEventListener: vi.fn((_type: string, listener: () => void) => {
        listeners.delete(listener)
      }),
    })),
  )
  return {
    set(value: boolean) {
      reduced = value
      listeners.forEach((listener) => listener())
    },
  }
}

function setWebGpu(adapter: unknown | null) {
  const requestAdapter = vi.fn().mockResolvedValue(adapter)
  Object.defineProperty(navigator, 'gpu', {
    configurable: true,
    value: { requestAdapter },
  })
  return requestAdapter
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

describe('BookingSuccessStage', () => {
  it('mounts one shader after WebGPU preflight and removes it for reduced motion', async () => {
    const motion = setReducedMotion()
    const requestAdapter = setWebGpu({})
    const { container } = render(
      <BookingSuccessStage>
        <p>Confirmed</p>
      </BookingSuccessStage>,
    )

    await flush()

    expect(requestAdapter).toHaveBeenCalledOnce()
    expect(container.querySelectorAll('[data-success-shader-ready]').length).toBe(1)
    fireEvent.click(container.querySelector('[data-success-shader-ready]')!)
    expect(
      container.querySelector('[data-ama-success-stage]')?.getAttribute(
        'data-shader-ready',
      ),
    ).toBe('true')

    act(() => motion.set(true))
    expect(container.querySelector('[data-success-shader-ready]')).toBeNull()
    expect(
      container.querySelector('[data-ama-success-stage]')?.getAttribute(
        'data-shader-ready',
      ),
    ).toBe('false')
  })

  it('keeps the static plate when WebGPU is unavailable', async () => {
    setReducedMotion()
    setWebGpu(null)
    const { container } = render(
      <BookingSuccessStage>
        <p>Confirmed</p>
      </BookingSuccessStage>,
    )

    await flush()

    expect(container.querySelector('[data-success-shader-ready]')).toBeNull()
    expect(container.querySelector('.ama-success-static-background')).not.toBeNull()
    expect(container.querySelectorAll('[data-ama-confetti-piece]').length).toBe(17)
  })

  it('does not mount a pending shader after reduced motion is enabled', async () => {
    const motion = setReducedMotion()
    let resolveAdapter: (adapter: unknown) => void = () => undefined
    const requestAdapter = vi.fn(
      () =>
        new Promise<unknown>((resolve) => {
          resolveAdapter = resolve
        }),
    )
    Object.defineProperty(navigator, 'gpu', {
      configurable: true,
      value: { requestAdapter },
    })
    const { container } = render(
      <BookingSuccessStage>
        <p>Confirmed</p>
      </BookingSuccessStage>,
    )

    expect(requestAdapter).toHaveBeenCalledOnce()
    act(() => motion.set(true))
    await act(async () => resolveAdapter({}))
    await flush()

    expect(container.querySelector('[data-success-shader-ready]')).toBeNull()
  })
})
