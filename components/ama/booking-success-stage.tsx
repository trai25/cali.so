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
  '--ama-confetti-color': string
  '--ama-confetti-delay': string
  '--ama-confetti-duration': string
  '--ama-confetti-spin-x': string
  '--ama-confetti-spin-z': string
  '--ama-confetti-tilt': string
  '--ama-confetti-x-from': string
  '--ama-confetti-x-to': string
  '--ama-confetti-y-apex': string
  '--ama-confetti-y-fall': string
  '--ama-confetti-y-from': string
}

type ConfettiPiece = {
  color: string
  delay: string
  duration: string
  key: string
  origin: 'left' | 'right'
  spinX: string
  spinZ: string
  tilt: string
  xFrom: string
  xTo: string
  yApex: string
  yFall: string
  yFrom: string
}

const CONFETTI_COLORS = [
  '#d9ef62',
  '#ff6a82',
  '#68b7ff',
  '#a50ff2',
  '#f1eee5',
] as const

const PIECES_PER_BURST = 18

// Ballistic decomposition: each piece is three nested layers so the physics
// read true — a horizontal drive with slight drag (linear-ish), a vertical
// rise/fall whose easings flip at the apex (decelerate up, accelerate down),
// and a finite 3D tumble on the visible card. Variation is derived from the
// index (no runtime randomness — SSR output stays stable).
const CONFETTI = (['left', 'right'] as const).flatMap(
  (origin, originIndex): ConfettiPiece[] => {
    const direction = origin === 'left' ? 1 : -1
    return Array.from({ length: PIECES_PER_BURST }, (_, index) => {
      const spread = ((index * 47 + originIndex * 31) % 100) / 100
      const lift = ((index * 73 + originIndex * 17) % 100) / 100
      const drop = ((index * 29 + originIndex * 53) % 100) / 100

      const xFrom = origin === 'left' ? -4 : 104
      const travel = 22 + spread * 48
      const rise = 36 + lift * 44

      return {
        color:
          CONFETTI_COLORS[
            (index + originIndex * 2) % CONFETTI_COLORS.length
          ]!,
        delay: `${(index * 41 + originIndex * 23) % 420}ms`,
        duration: `${2600 + ((index * 89 + originIndex * 37) % 900)}ms`,
        key: `${origin}-${index}`,
        origin,
        spinX: `${360 + ((index * 97 + originIndex * 43) % 540)}deg`,
        spinZ: `${direction * (540 + ((index * 67) % 360))}deg`,
        tilt: `${(index * 23 + originIndex * 11) % 180}deg`,
        xFrom: `${xFrom}vw`,
        xTo: `${xFrom + direction * travel}vw`,
        yApex: `${104 - rise}dvh`,
        yFall: `${84 + drop * 24}dvh`,
        yFrom: '104dvh',
      }
    })
  },
)

/**
 * The shared dark AMA stage: static gradient plate, WebGPU field once ready,
 * and the centered content column, with the page's tokens flipped dark via
 * `body:has(.ama-success-stage)`. The celebration extras (confetti, the
 * confirmation seal) belong to BookingSuccessStage alone.
 */
export function AmaStage({
  children,
  align = 'center',
  extras,
}: {
  children: React.ReactNode
  /** `start` keeps form-like content left-aligned (the guest manage page). */
  align?: 'center' | 'start'
  extras?: React.ReactNode
}) {
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
      {extras}
      <div
        className={
          align === 'start'
            ? 'ama-success-stage-content ama-success-stage-content--start'
            : 'ama-success-stage-content'
        }
      >
        {children}
      </div>
    </section>
  )
}

export function BookingSuccessStage({ children }: { children: React.ReactNode }) {
  return (
    <AmaStage
      extras={
        <span className="ama-success-confetti" aria-hidden>
        {CONFETTI.map(
          ({
            color,
            delay,
            duration,
            key,
            origin,
            spinX,
            spinZ,
            tilt,
            xFrom,
            xTo,
            yApex,
            yFall,
            yFrom,
          }) => (
            <span
              key={key}
              className="ama-success-confetti-piece"
              data-ama-confetti-piece
              data-ama-confetti-origin={origin}
              style={
                {
                  '--ama-confetti-color': color,
                  '--ama-confetti-delay': delay,
                  '--ama-confetti-duration': duration,
                  '--ama-confetti-spin-x': spinX,
                  '--ama-confetti-spin-z': spinZ,
                  '--ama-confetti-tilt': tilt,
                  '--ama-confetti-x-from': xFrom,
                  '--ama-confetti-x-to': xTo,
                  '--ama-confetti-y-apex': yApex,
                  '--ama-confetti-y-fall': yFall,
                  '--ama-confetti-y-from': yFrom,
                } as ConfettiStyle
              }
            >
              <span className="ama-success-confetti-fall">
                <span className="ama-success-confetti-card" />
              </span>
            </span>
          ),
        )}
        </span>
      }
    >
      <span className="ama-success-mark" aria-hidden>
        ✓
      </span>
      {children}
    </AmaStage>
  )
}
