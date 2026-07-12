import { ImageResponse } from 'next/og'

import { getAllPosts, getPost } from '~/lib/content'
import { formatDate } from '~/lib/date'
import { coverDataUri, ogColors, ogFonts, OgPolaroid, OgSheet } from '~/lib/og'
import { tiltFromSlug } from '~/lib/polaroid'

export function generateStaticParams() {
  return getAllPosts().map((post) => ({ slug: post.slug }))
}

export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'
export const alt = 'Cali Castle'

export default async function OpengraphImage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const post = getPost((await params).slug)
  const date = formatDate(post.publishedAt)

  return new ImageResponse(
    (
      <OgSheet>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 72,
            padding: '0 112px',
            width: '100%',
          }}
        >
          {post.cover && (
            <OgPolaroid
              src={await coverDataUri(post.cover.src)}
              caption={date}
              tilt={tiltFromSlug(post.slug)}
            />
          )}
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              flex: 1,
              gap: 28,
            }}
          >
            <div
              style={{
                display: 'flex',
                fontSize: 54,
                fontWeight: 600,
                lineHeight: 1.3,
                letterSpacing: '-0.02em',
                color: ogColors.foreground,
                textWrap: 'balance',
              }}
            >
              {post.title}
            </div>
            <div
              style={{
                display: 'flex',
                fontSize: 24,
                color: ogColors.mutedForeground,
              }}
            >
              Cali Castle · {date}
            </div>
          </div>
        </div>
      </OgSheet>
    ),
    {
      ...size,
      fonts: await ogFonts(post.title + date + 'Cali Castle'),
    },
  )
}
