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
  '--ama-confetti-drift': string
  '--ama-confetti-duration': string
  '--ama-confetti-left': string
  '--ama-confetti-rotation': string
}

type ConfettiPiece = {
  left: string
  drift: string
  delay: string
  duration: string
  rotation: string
  color: string
}

const CONFETTI = [
  {
    left: '4%',
    drift: '-18px',
    delay: '0ms',
    duration: '2100ms',
    rotation: '520deg',
    color: '#d9ef62',
  },
  {
    left: '9%',
    drift: '26px',
    delay: '90ms',
    duration: '1950ms',
    rotation: '-430deg',
    color: '#ff6a82',
  },
  {
    left: '14%',
    drift: '-34px',
    delay: '230ms',
    duration: '2250ms',
    rotation: '610deg',
    color: '#68b7ff',
  },
  {
    left: '19%',
    drift: '42px',
    delay: '40ms',
    duration: '2050ms',
    rotation: '-510deg',
    color: '#a50ff2',
  },
  {
    left: '25%',
    drift: '-22px',
    delay: '310ms',
    duration: '1900ms',
    rotation: '470deg',
    color: '#f1eee5',
  },
  {
    left: '31%',
    drift: '48px',
    delay: '160ms',
    duration: '2200ms',
    rotation: '-620deg',
    color: '#d9ef62',
  },
  {
    left: '37%',
    drift: '-40px',
    delay: '20ms',
    duration: '2000ms',
    rotation: '560deg',
    color: '#ff6a82',
  },
  {
    left: '43%',
    drift: '20px',
    delay: '260ms',
    duration: '2300ms',
    rotation: '-460deg',
    color: '#68b7ff',
  },
  {
    left: '49%',
    drift: '-46px',
    delay: '120ms',
    duration: '2100ms',
    rotation: '640deg',
    color: '#a50ff2',
  },
  {
    left: '55%',
    drift: '32px',
    delay: '350ms',
    duration: '1950ms',
    rotation: '-540deg',
    color: '#f1eee5',
  },
  {
    left: '61%',
    drift: '-28px',
    delay: '70ms',
    duration: '2250ms',
    rotation: '490deg',
    color: '#d9ef62',
  },
  {
    left: '67%',
    drift: '44px',
    delay: '210ms',
    duration: '2050ms',
    rotation: '-600deg',
    color: '#ff6a82',
  },
  {
    left: '73%',
    drift: '-38px',
    delay: '10ms',
    duration: '2150ms',
    rotation: '580deg',
    color: '#68b7ff',
  },
  {
    left: '79%',
    drift: '24px',
    delay: '290ms',
    duration: '1900ms',
    rotation: '-450deg',
    color: '#a50ff2',
  },
  {
    left: '85%',
    drift: '-48px',
    delay: '140ms',
    duration: '2200ms',
    rotation: '630deg',
    color: '#f1eee5',
  },
  {
    left: '91%',
    drift: '30px',
    delay: '330ms',
    duration: '2000ms',
    rotation: '-520deg',
    color: '#d9ef62',
  },
  {
    left: '96%',
    drift: '-20px',
    delay: '180ms',
    duration: '2280ms',
    rotation: '550deg',
    color: '#ff6a82',
  },
] as const satisfies readonly ConfettiPiece[]

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
          ({ left, drift, delay, duration, rotation, color }) => (
            <span
              key={`${left}-${delay}`}
              className="ama-success-confetti-piece"
              data-ama-confetti-piece
              style={
                {
                  '--ama-confetti-color': color,
                  '--ama-confetti-delay': delay,
                  '--ama-confetti-drift': drift,
                  '--ama-confetti-duration': duration,
                  '--ama-confetti-left': left,
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
