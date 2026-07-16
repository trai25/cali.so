import { cacheLife } from 'next/cache'
import { ImageResponse } from 'next/og'

import type { Post } from './content'
import { formatDate, formatDateEn } from './date'
import type { Locale } from './locale-route'
import type { ArchivedNewsletter } from './newsletters'
import {
  coverDataUri,
  ogColors,
  ogFonts,
  OgPolaroid,
  OgSheet,
  publicImageDataUri,
} from './og'
import { tiltFromSlug } from './polaroid'
import {
  publicPageMetadata,
  type PublicSection,
} from './public-page-metadata'

const NAME = 'Cali Castle'
const HOME_INTRODUCTIONS: Record<Locale, string> = {
  zh: publicPageMetadata.home.zh.ogDescription,
  en: publicPageMetadata.home.en.ogDescription,
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

function OgSectionMark({ section }: { section: PublicSection }) {
  const stroke = ogColors.paperInk
  const fill = ogColors.paper
  const faint = ogColors.border

  if (section === 'blog') {
    return (
      <svg width="232" height="232" viewBox="0 0 232 232" fill="none">
        <rect x="54" y="26" width="126" height="168" rx="4" fill={fill} stroke={faint} transform="rotate(5 54 26)" />
        <rect x="42" y="34" width="126" height="168" rx="4" fill={fill} stroke={faint} transform="rotate(-4 42 34)" />
        <rect x="52" y="31" width="126" height="168" rx="4" fill="white" stroke={stroke} />
        <path d="M77 70H151M77 92H151M77 114H137M77 157H118" stroke={stroke} strokeWidth="3" strokeLinecap="round" />
      </svg>
    )
  }

  if (section === 'photos') {
    return (
      <svg width="232" height="232" viewBox="0 0 232 232" fill="none">
        <g transform="rotate(-7 116 116)">
          <rect x="41" y="39" width="150" height="164" fill={fill} stroke={faint} />
          <rect x="51" y="49" width="130" height="112" fill={faint} />
        </g>
        <g transform="rotate(5 116 116)">
          <rect x="41" y="32" width="150" height="164" fill={fill} stroke={stroke} />
          <rect x="51" y="42" width="130" height="112" fill="white" stroke={stroke} />
          <circle cx="148" cy="72" r="14" fill={faint} />
          <path d="M52 154L87 112L112 137L132 115L181 154" fill={faint} stroke={stroke} strokeWidth="2" strokeLinejoin="round" />
        </g>
      </svg>
    )
  }

  return (
    <svg width="232" height="232" viewBox="0 0 232 232" fill="none">
      <circle cx="116" cy="116" r="76" stroke={faint} strokeWidth="2" strokeDasharray="6 7" />
      <path d="M116 20V212M20 116H212M48 48L184 184M184 48L48 184" stroke={faint} strokeWidth="2" />
      <circle cx="116" cy="116" r="50" fill={fill} stroke={stroke} strokeWidth="2" />
      <path d="M88 139L101 100L140 87L127 126L88 139Z" fill="white" stroke={stroke} strokeWidth="3" strokeLinejoin="round" />
      <circle cx="116" cy="113" r="7" fill={stroke} />
    </svg>
  )
}

async function renderSectionOgImage(section: PublicSection, locale: Locale) {
  'use cache'
  cacheLife('max')

  const copy = publicPageMetadata[section][locale]
  const signature = 'Cali Castle'

  return new ImageResponse(
    (
      <OgSheet>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 64,
            padding: '0 104px',
            width: '100%',
          }}
        >
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              width: 720,
            }}
          >
            <div
              style={{
                display: 'flex',
                fontSize: 22,
                color: ogColors.paperInk,
              }}
            >
              {signature}
            </div>
            <div
              style={{
                display: 'flex',
                marginTop: 28,
                fontSize: 70,
                fontWeight: 600,
                letterSpacing: '-0.02em',
                color: ogColors.foreground,
              }}
            >
              {copy.title}
            </div>
            <div
              style={{
                display: 'flex',
                marginTop: 24,
                fontSize: 29,
                lineHeight: 1.48,
                color: ogColors.mutedForeground,
              }}
            >
              {copy.description}
            </div>
          </div>
          <div style={{ display: 'flex', flexShrink: 0 }}>
            <OgSectionMark section={section} />
          </div>
        </div>
      </OgSheet>
    ),
    {
      ...IMAGE_SIZE,
      fonts: await ogFonts(signature + copy.title + copy.description),
    },
  ).arrayBuffer()
}

export async function createSectionOgImage(section: PublicSection, locale: Locale) {
  return new Response(await renderSectionOgImage(section, locale), {
    headers: { 'content-type': 'image/png' },
  })
}

type NewsletterOgInput = Pick<
  ArchivedNewsletter,
  'id' | 'title' | 'titleEn' | 'description' | 'descriptionEn'
>

async function renderNewsletterOgImage(newsletter: NewsletterOgInput, locale: Locale) {
  'use cache'
  cacheLife('max')

  const title = locale === 'en' ? newsletter.titleEn : newsletter.title
  const description =
    locale === 'en' ? newsletter.descriptionEn : newsletter.description
  const archiveLabel =
    locale === 'en'
      ? `Cali Castle · Archive ${newsletter.id.padStart(3, '0')}`
      : `Cali Castle · 存档 ${newsletter.id.padStart(3, '0')}`
  const cover = await coverDataUri(
    `/content/newsletters/${newsletter.id}/cover.png`,
  )

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
          <OgPolaroid src={cover} tilt={-2} width={432} />
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              flexShrink: 0,
              width: 512,
            }}
          >
            <div
              style={{
                display: 'flex',
                fontSize: 21,
                color: ogColors.paperInk,
              }}
            >
              {archiveLabel}
            </div>
            <div
              style={{
                display: 'flex',
                marginTop: 24,
                fontSize: 48,
                fontWeight: 600,
                lineHeight: 1.25,
                letterSpacing: '-0.02em',
                color: ogColors.foreground,
              }}
            >
              {title}
            </div>
            <div
              style={{
                display: 'flex',
                marginTop: 24,
                fontSize: 24,
                lineHeight: 1.5,
                color: ogColors.mutedForeground,
              }}
            >
              {description}
            </div>
          </div>
        </div>
      </OgSheet>
    ),
    {
      ...IMAGE_SIZE,
      fonts: await ogFonts(archiveLabel + title + description),
    },
  ).arrayBuffer()
}

export async function createNewsletterOgImage(
  newsletter: ArchivedNewsletter,
  locale: Locale,
) {
  const input: NewsletterOgInput = {
    id: newsletter.id,
    title: newsletter.title,
    titleEn: newsletter.titleEn,
    description: newsletter.description,
    descriptionEn: newsletter.descriptionEn,
  }

  return new Response(await renderNewsletterOgImage(input, locale), {
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
