'use client'

import dynamic from 'next/dynamic'
import { type CSSProperties, useCallback, useEffect, useState } from 'react'

import { useWebGpuCapability } from '~/components/use-webgpu-capability'

const UndertonesEightField = dynamic(
  () =>
    import('./undertones-eight-field').then(
      (module) => module.UndertonesEightField,
    ),
  { ssr: false },
)

const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)'

type ConfettiStyle = CSSProperties & {
  '--ama-confetti-apex-x': string
  '--ama-confetti-apex-y': string
  '--ama-confetti-color': string
  '--ama-confetti-delay': string
  '--ama-confetti-duration': string
  '--ama-confetti-end-x': string
  '--ama-confetti-end-y': string
  '--ama-confetti-mid-rotation': string
  '--ama-confetti-origin-x': string
  '--ama-confetti-origin-y': string
  '--ama-confetti-rotation': string
}

type ConfettiPiece = {
  apexX: string
  apexY: string
  color: string
  delay: string
  duration: string
  endX: string
  endY: string
  key: string
  midRotation: string
  origin: 'left' | 'right'
  originX: string
  originY: string
  rotation: string
}

const CONFETTI_COLORS = [
  '#d9ef62',
  '#ff6a82',
  '#68b7ff',
  '#a50ff2',
  '#f1eee5',
] as const

const BURST_PATHS = [
  { apexX: 30, apexY: 64, endX: 38, endY: 43 },
  { apexX: 36, apexY: 76, endX: 44, endY: 55 },
  { apexX: 42, apexY: 58, endX: 51, endY: 35 },
  { apexX: 46, apexY: 84, endX: 52, endY: 64 },
  { apexX: 50, apexY: 68, endX: 58, endY: 44 },
  { apexX: 54, apexY: 79, endX: 61, endY: 58 },
  { apexX: 58, apexY: 60, endX: 65, endY: 37 },
  { apexX: 62, apexY: 88, endX: 69, endY: 68 },
  { apexX: 66, apexY: 72, endX: 73, endY: 50 },
  { apexX: 70, apexY: 82, endX: 76, endY: 62 },
  { apexX: 74, apexY: 64, endX: 81, endY: 42 },
  { apexX: 78, apexY: 76, endX: 85, endY: 54 },
] as const

const CONFETTI = (['left', 'right'] as const).flatMap(
  (origin, originIndex): ConfettiPiece[] => {
    const direction = origin === 'left' ? 1 : -1
    return BURST_PATHS.map((path, index) => {
      const rotation = direction * (440 + ((index * 47) % 250))

      return {
        apexX: `${origin === 'left' ? path.apexX : 100 - path.apexX}vw`,
        apexY: `${100 - path.apexY}dvh`,
        color:
          CONFETTI_COLORS[
            (index + originIndex * 2) % CONFETTI_COLORS.length
          ]!,
        delay: `${(index * 53 + originIndex * 29) % 260}ms`,
        duration: `${2200 + ((index * 73 + originIndex * 41) % 520)}ms`,
        endX: `${origin === 'left' ? path.endX : 100 - path.endX}vw`,
        endY: `${100 - path.endY}dvh`,
        key: `${origin}-${index}`,
        midRotation: `${Math.round(rotation * 0.58)}deg`,
        origin,
        originX:
          origin === 'left'
            ? 'calc(env(safe-area-inset-left) - 1rem)'
            : 'calc(100vw - env(safe-area-inset-right) + 1rem)',
        originY:
          'calc(100dvh - env(safe-area-inset-bottom) + 1rem)',
        rotation: `${rotation}deg`,
      }
    })
  },
)

export function BookingSuccessStage({ children }: { children: React.ReactNode }) {
  const [shaderMounted, setShaderMounted] = useState(false)
  const [shaderReady, setShaderReady] = useState(false)
  const {
    check: checkWebGpu,
    markUnavailable: markWebGpuUnavailable,
  } = useWebGpuCapability()

  useEffect(() => {
    const preference = window.matchMedia(REDUCED_MOTION_QUERY)
    let active = true

    const update = () => {
      if (preference.matches) {
        setShaderMounted(false)
        setShaderReady(false)
        return
      }

      void checkWebGpu().then((available) => {
        if (active && !preference.matches && available) {
          setShaderMounted(true)
        }
      })
    }

    update()
    preference.addEventListener('change', update)
    return () => {
      active = false
      preference.removeEventListener('change', update)
    }
  }, [checkWebGpu])

  const markShaderUnavailable = useCallback(() => {
    markWebGpuUnavailable()
    setShaderMounted(false)
    setShaderReady(false)
  }, [markWebGpuUnavailable])

  const markShaderReady = useCallback(() => setShaderReady(true), [])

  return (
    <section
      className="ama-success-stage"
      data-ama-success-stage
      data-shader-ready={shaderReady ? 'true' : 'false'}
    >
      <span className="ama-success-static-background" aria-hidden />
      {shaderMounted ? (
        <span className="ama-success-shader-layer" aria-hidden>
          <UndertonesEightField
            onUnavailable={markShaderUnavailable}
            onReady={markShaderReady}
          />
        </span>
      ) : null}
      <span className="ama-success-confetti" aria-hidden>
        {CONFETTI.map(
          ({
            apexX,
            apexY,
            color,
            delay,
            duration,
            endX,
            endY,
            key,
            midRotation,
            origin,
            originX,
            originY,
            rotation,
          }) => (
            <span
              key={key}
              className="ama-success-confetti-piece"
              data-ama-confetti-piece
              data-ama-confetti-origin={origin}
              style={
                {
                  '--ama-confetti-apex-x': apexX,
                  '--ama-confetti-apex-y': apexY,
                  '--ama-confetti-color': color,
                  '--ama-confetti-delay': delay,
                  '--ama-confetti-duration': duration,
                  '--ama-confetti-end-x': endX,
                  '--ama-confetti-end-y': endY,
                  '--ama-confetti-mid-rotation': midRotation,
                  '--ama-confetti-origin-x': originX,
                  '--ama-confetti-origin-y': originY,
                  '--ama-confetti-rotation': rotation,
                } as ConfettiStyle
              }
            />
          ),
        )}
      </span>
      <div className="ama-success-stage-content">
        <span className="ama-success-mark" aria-hidden>
          ✓
        </span>
        {children}
      </div>
    </section>
  )
}
