import type { PublicPhotoSelection } from './repository'

// Local development stand-ins for the Published Photo Selection, so the
// photos surfaces render without Bunny/database credentials. Each "photo"
// is a generated calibration test card (data-URI SVG) — obviously a
// fixture, but native to the technical-print register, and enough to
// exercise the masonry, hover marks, lightbox, and EXIF plate.
// Production never sees these: the server read only falls back to them
// under NODE_ENV=development.

type CardSpec = {
  index: number
  width: number
  height: number
  paper: string
  ink: string
}

function testCardSvg({ index, width, height, paper, ink }: CardSpec): string {
  const number = String(index).padStart(2, '0')
  const cx = width / 2
  const cy = height / 2
  const r = Math.min(width, height) * 0.27
  const bracket = Math.min(width, height) * 0.055
  const inset = Math.min(width, height) * 0.06
  const corner = (x: number, y: number, dx: number, dy: number) =>
    `M${x + dx * bracket} ${y}H${x}V${y + dy * bracket}`

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
<rect width="${width}" height="${height}" fill="${paper}"/>
<g stroke="${ink}" stroke-opacity="0.12" stroke-width="2">
${Array.from({ length: 7 }, (_, i) => `<line x1="${((i + 1) * width) / 8}" y1="0" x2="${((i + 1) * width) / 8}" y2="${height}"/>`).join('\n')}
${Array.from({ length: 7 }, (_, i) => `<line x1="0" y1="${((i + 1) * height) / 8}" x2="${width}" y2="${((i + 1) * height) / 8}"/>`).join('\n')}
</g>
<g fill="none" stroke="${ink}" stroke-opacity="0.55" stroke-width="3">
<circle cx="${cx}" cy="${cy}" r="${r}"/>
<circle cx="${cx}" cy="${cy}" r="${r * 0.62}"/>
<path d="M${cx - r * 1.25} ${cy}H${cx + r * 1.25}M${cx} ${cy - r * 1.25}V${cy + r * 1.25}"/>
</g>
<g fill="none" stroke="${ink}" stroke-opacity="0.8" stroke-width="4">
<path d="${corner(inset, inset, 1, 1)}"/>
<path d="${corner(width - inset, inset, -1, 1)}"/>
<path d="${corner(inset, height - inset, 1, -1)}"/>
<path d="${corner(width - inset, height - inset, -1, -1)}"/>
</g>
<text x="${inset}" y="${height - inset * 1.4}" fill="${ink}" fill-opacity="0.85" font-family="ui-monospace, monospace" font-size="${Math.min(width, height) * 0.16}" font-weight="600">${number}</text>
<text x="${inset}" y="${inset * 2.4}" fill="${ink}" fill-opacity="0.6" font-family="ui-monospace, monospace" font-size="${Math.min(width, height) * 0.035}" letter-spacing="4">CALI.SO TEST CARD ${number} — ${width}×${height}</text>
</svg>`

  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`
}

const CARDS: Array<
  CardSpec & Omit<PublicPhotoSelection['items'][number], 'id' | 'width' | 'height' | 'renditions'>
> = [
  {
    index: 1,
    width: 1600,
    height: 1200,
    paper: '#E8E5DE',
    ink: '#2B2A26',
    altText: { zhHans: '测试卡 01', en: 'Test card 01' },
    locationLabel: { zhHans: '蛇口', en: 'Shekou' },
    capturedAt: new Date('2026-05-08T02:00:00.000Z'),
    camera: {
      make: 'Cali Labs',
      model: 'Field Unit A7',
      lens: 'Fixture 35mm ƒ/2.0',
      focalLengthMillimeters: 35,
      aperture: 2,
      shutterSpeedSeconds: 0.004,
      iso: 200,
    },
  },
  {
    index: 2,
    width: 1200,
    height: 1600,
    paper: '#2E2C28',
    ink: '#EDEAE3',
    altText: { zhHans: '测试卡 02', en: 'Test card 02' },
    locationLabel: { zhHans: '台北', en: 'Taipei' },
    capturedAt: new Date('2026-04-21T10:30:00.000Z'),
    camera: {
      make: 'Cali Labs',
      model: 'Field Unit A7',
      focalLengthMillimeters: 50,
      aperture: 1.8,
      shutterSpeedSeconds: 0.01,
      iso: 640,
    },
  },
  {
    index: 3,
    width: 1600,
    height: 1600,
    paper: '#DAD6CD',
    ink: '#2B2A26',
    altText: { zhHans: '测试卡 03', en: 'Test card 03' },
    capturedAt: new Date('2026-03-02T08:15:00.000Z'),
  },
  {
    index: 4,
    width: 1920,
    height: 1080,
    paper: '#CFCAC0',
    ink: '#2B2A26',
    altText: { zhHans: '测试卡 04', en: 'Test card 04' },
    locationLabel: { zhHans: '京都', en: 'Kyoto' },
    capturedAt: new Date('2026-02-14T23:45:00.000Z'),
    camera: {
      make: 'Cali Labs',
      model: 'Test Unit 02',
      lens: 'Fixture 23mm ƒ/2.8',
      focalLengthMillimeters: 23,
      aperture: 2.8,
      shutterSpeedSeconds: 2,
      iso: 100,
    },
  },
  {
    index: 5,
    width: 1200,
    height: 1600,
    paper: '#E0DCD3',
    ink: '#2B2A26',
    altText: { zhHans: '测试卡 05', en: 'Test card 05' },
    locationLabel: { zhHans: '深圳', en: 'Shenzhen' },
  },
  {
    index: 6,
    width: 1600,
    height: 1200,
    paper: '#BFBAB0',
    ink: '#2B2A26',
    altText: { zhHans: '测试卡 06', en: 'Test card 06' },
    capturedAt: new Date('2026-01-05T12:00:00.000Z'),
    camera: {
      make: 'Cali Labs',
      model: 'Field Unit A7',
      lens: 'Fixture 85mm ƒ/1.4',
      focalLengthMillimeters: 85,
      aperture: 1.4,
      shutterSpeedSeconds: 0.002,
      iso: 400,
    },
  },
]

export function devPhotoSelectionFixture(): PublicPhotoSelection {
  return {
    revision: 'dev-fixture',
    publishedAt: new Date('2026-07-18T00:00:00.000Z'),
    count: CARDS.length,
    items: CARDS.map(({ index, width, height, paper, ink, ...rest }) => ({
      id: `dev-test-card-${String(index).padStart(2, '0')}`,
      width,
      height,
      renditions: [
        {
          profileWidth: 640,
          src: testCardSvg({ index, width, height, paper, ink }),
          width,
          height,
        },
      ],
      focalPoint: { x: 0.5, y: 0.5 },
      ...rest,
    })),
  }
}
