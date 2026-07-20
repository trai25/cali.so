'use client'

import {
  ChromaFlow,
  FilmGrain,
  FlutedGlass,
  Shader,
  Swirl,
} from 'shaders/react'

import { useHiddenShaderField } from '~/components/use-hidden-shader-field'

export function UndertonesEightField({
  onUnavailable,
  onReady,
}: {
  onUnavailable: () => void
  onReady: () => void
}) {
  const { handleReady, ready } = useHiddenShaderField(
    onUnavailable,
    onReady,
  )

  return (
    <span
      className="ama-success-shader-shell"
      data-ready={ready ? 'true' : 'false'}
    >
      <Shader
        className="ama-success-shader-canvas"
        disableTelemetry
        onReady={handleReady}
      >
        <Swirl colorA="#000000" colorB="#0a0a0a" detail={1.7} />
        <ChromaFlow
          baseColor="#18181a"
          downColor="#0c096e"
          leftColor="#7618db"
          momentum={13}
          rightColor="#301252"
          upColor="#a50ff2"
        />
        <FlutedGlass
          aberration={0.61}
          angle={284}
          frequency={8}
          highlight={0.12}
          highlightSoftness={0}
          lightAngle={-90}
          refraction={4}
          shape="rounded"
          softness={1}
          speed={0.15}
        />
        <FilmGrain strength={0.05} />
      </Shader>
    </span>
  )
}
