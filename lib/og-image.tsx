import { cacheLife } from 'next/cache'
import { ImageResponse } from 'next/og'

import type { Post } from './content'
import { formatDate, formatDateEn } from './date'
import type { Locale } from './locale-route'
import {
  coverDataUri,
  ogColors,
  ogFonts,
  OgPolaroid,
  OgSheet,
  publicImageDataUri,
} from './og'
import { tiltFromSlug } from './polaroid'
import { seo, seoEn } from './seo'

const NAME = 'Cali Castle'
const TAGLINES: Record<Locale, string> = {
  zh: '开发者、设计师、细节控、创始人',
  en: 'Developer, designer, and founder',
}

const HOME_INTRODUCTIONS: Record<Locale, string> = {
  zh: seo.description,
  en: seoEn.description,
}

const IMAGE_SIZE = { width: 1200, height: 630 } as const

async function renderHomeOgImage(locale: Locale) {
  'use cache'
  cacheLife('max')

  const introduction = HOME_INTRODUCTIONS[locale]
  const portrait = await publicImageDataUri('/images/headshot.jpg')

  return new ImageResponse(
    (
      <OgSheet>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 72,
            padding: '0 112px',
            width: '100%',
          }}
        >
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 28,
              width: 680,
            }}
          >
            <div
              style={{
                display: 'flex',
                fontSize: 68,
                fontWeight: 600,
                letterSpacing: '-0.02em',
                color: ogColors.foreground,
              }}
            >
              {NAME}
            </div>
            <div
              style={{
                display: 'flex',
                fontSize: 32,
                lineHeight: 1.5,
                color: ogColors.mutedForeground,
              }}
            >
              {introduction}
            </div>
          </div>
          <div
            style={{
              display: 'flex',
              flexShrink: 0,
              padding: 8,
              paddingBottom: 24,
              backgroundColor: ogColors.paper,
              boxShadow: '0 0 0 1px rgb(0 0 0 / 0.04), 0 8px 30px rgb(0 0 0 / 0.12)',
              transform: 'rotate(2deg)',
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={portrait}
              alt=""
              width={216}
              height={198}
              style={{ objectFit: 'cover', width: 216, height: 198 }}
            />
          </div>
        </div>
      </OgSheet>
    ),
    { ...IMAGE_SIZE, fonts: await ogFonts(NAME + introduction) },
  ).arrayBuffer()
}

export async function createHomeOgImage(locale: Locale) {
  return new Response(await renderHomeOgImage(locale), {
    headers: { 'content-type': 'image/png' },
  })
}

async function renderSiteOgImage(locale: Locale) {
  'use cache'
  cacheLife('max')

  const tagline = TAGLINES[locale]

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
            {tagline}
          </div>
        </div>
      </OgSheet>
    ),
    { ...IMAGE_SIZE, fonts: await ogFonts(NAME + tagline) },
  ).arrayBuffer()
}

export async function createSiteOgImage(locale: Locale) {
  return new Response(await renderSiteOgImage(locale), {
    headers: { 'content-type': 'image/png' },
  })
}

type PostOgInput = Pick<Post, 'slug' | 'title' | 'titleEn' | 'publishedAt' | 'cover'>

async function renderPostOgImage(post: PostOgInput, locale: Locale) {
  'use cache'
  cacheLife('max')

  const title = locale === 'en' ? post.titleEn : post.title
  const date = locale === 'en' ? formatDateEn(post.publishedAt) : formatDate(post.publishedAt)

  return new ImageResponse(
    (
      <OgSheet>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 64,
            padding: '0 96px',
            width: '100%',
          }}
        >
          {post.cover && (
            <OgPolaroid
              src={await coverDataUri(post.cover.src)}
              tilt={tiltFromSlug(post.slug)}
              width={432}
            />
          )}
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              flexGrow: 0,
              flexShrink: 0,
              gap: 28,
              width: 512,
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
              {title}
            </div>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                flexShrink: 0,
                fontSize: 24,
                gap: 8,
                color: ogColors.mutedForeground,
                width: '100%',
              }}
            >
              <div style={{ display: 'flex', flexShrink: 0 }}>{NAME}</div>
              <div style={{ display: 'flex', flexShrink: 0 }}>·</div>
              <div style={{ display: 'flex', flexShrink: 0 }}>{date}</div>
            </div>
          </div>
        </div>
      </OgSheet>
    ),
    {
      ...IMAGE_SIZE,
      fonts: await ogFonts(title + date + NAME),
    },
  ).arrayBuffer()
}

export async function createPostOgImage(post: Post, locale: Locale) {
  const input: PostOgInput = {
    slug: post.slug,
    title: post.title,
    titleEn: post.titleEn,
    publishedAt: post.publishedAt,
    cover: post.cover,
  }

  return new Response(await renderPostOgImage(input, locale), {
    headers: { 'content-type': 'image/png' },
  })
}
