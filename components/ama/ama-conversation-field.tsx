'use client'

import { Shader, SineWave } from 'shaders/react'

import { useHiddenShaderField } from '~/components/use-hidden-shader-field'

const UPPER_WAVE_POSITION = { x: 0.5, y: 0.46 }
const LOWER_WAVE_POSITION = { x: 0.5, y: 0.54 }

export function AmaConversationField({
  onUnavailable,
  onReady,
}: {
  onUnavailable: () => void
  onReady: () => void
}) {
  const { handleReady, ink, ready } = useHiddenShaderField(
    onUnavailable,
    onReady,
  )

  return (
    <span
      className="ama-conversation-shader-shell"
      data-ready={ready ? 'true' : 'false'}
    >
      <Shader
        className="ama-conversation-shader-canvas"
        colorSpace="srgb"
        disableTelemetry
        onReady={handleReady}
      >
        <SineWave
          amplitude={0.13}
          color={ink}
          frequency={1.15}
          position={UPPER_WAVE_POSITION}
          softness={0.16}
          speed={0.08}
          thickness={0.035}
        />
        <SineWave
          amplitude={0.11}
          angle={180}
          color={ink}
          frequency={1.05}
          opacity={0.72}
          position={LOWER_WAVE_POSITION}
          softness={0.16}
          speed={-0.065}
          thickness={0.03}
        />
      </Shader>
    </span>
  )
}
