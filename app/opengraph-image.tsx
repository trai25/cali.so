import { ImageResponse } from 'next/og'

import { ogColors, ogFonts, OgSheet } from '~/lib/og'

export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'
export const alt = 'Cali Castle'

const NAME = 'Cali Castle'
const TAGLINE = '开发者、设计师、细节控、创始人'

export default async function OpengraphImage() {
  return new ImageResponse(
    (
      <OgSheet>
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 24,
            width: '100%',
          }}
        >
          <div
            style={{
              display: 'flex',
              fontSize: 72,
              fontWeight: 600,
              letterSpacing: '-0.02em',
              color: ogColors.foreground,
            }}
          >
            {NAME}
          </div>
          <div style={{ display: 'flex', fontSize: 30, color: ogColors.mutedForeground }}>
            {TAGLINE}
          </div>
        </div>
      </OgSheet>
    ),
    { ...size, fonts: await ogFonts(NAME + TAGLINE) },
  )
}
