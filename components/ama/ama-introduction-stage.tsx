'use client'

import dynamic from 'next/dynamic'
import { useCallback, useEffect, useRef, useState } from 'react'

import { useWebGpuCapability } from '~/components/use-webgpu-capability'

const AmaConversationField = dynamic(
  () =>
    import('./ama-conversation-field').then(
      (module) => module.AmaConversationField,
    ),
  { ssr: false },
)

const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)'

export function AmaIntroductionStage({ children }: { children: React.ReactNode }) {
  const rootRef = useRef<HTMLDivElement>(null)
  const [inViewport, setInViewport] = useState(true)
  const [shaderMounted, setShaderMounted] = useState(false)
  const [shaderReady, setShaderReady] = useState(false)
  const {
    check: checkWebGpu,
    markUnavailable: markWebGpuUnavailable,
  } = useWebGpuCapability()

  useEffect(() => {
    const root = rootRef.current
    if (!root || typeof IntersectionObserver === 'undefined') return

    const observer = new IntersectionObserver(([entry]) =>
      setInViewport(Boolean(entry?.isIntersecting)),
    )
    observer.observe(root)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    const preference = window.matchMedia(REDUCED_MOTION_QUERY)
    let active = true

    const reconcileShaderMount = () => {
      if (preference.matches || !inViewport) {
        setShaderMounted(false)
        setShaderReady(false)
        return
      }

      void checkWebGpu().then((available) => {
        if (active && !preference.matches && inViewport && available) {
          setShaderMounted(true)
        }
      })
    }

    reconcileShaderMount()
    preference.addEventListener('change', reconcileShaderMount)
    return () => {
      active = false
      preference.removeEventListener('change', reconcileShaderMount)
    }
  }, [checkWebGpu, inViewport])

  const markShaderUnavailable = useCallback(() => {
    markWebGpuUnavailable()
    setShaderMounted(false)
    setShaderReady(false)
  }, [markWebGpuUnavailable])

  const markShaderReady = useCallback(() => setShaderReady(true), [])

  return (
    <div
      ref={rootRef}
      className="ama-introduction-stage"
      data-ama-introduction-stage
      data-in-viewport={inViewport ? 'true' : 'false'}
      data-shader-ready={shaderReady ? 'true' : 'false'}
    >
      <span className="ama-conversation-static" aria-hidden>
        <svg viewBox="0 0 600 240" preserveAspectRatio="none">
          <path d="M0 102C100 24 200 180 300 102S500 180 600 102" />
          <path d="M0 138C100 216 200 60 300 138S500 60 600 138" />
        </svg>
      </span>
      {shaderMounted ? (
        <span className="ama-conversation-shader-layer" aria-hidden>
          <AmaConversationField
            onUnavailable={markShaderUnavailable}
            onReady={markShaderReady}
          />
        </span>
      ) : null}
      <div className="ama-introduction-content">{children}</div>
    </div>
  )
}
