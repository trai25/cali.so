import { readFileSync } from 'node:fs'
import path from 'node:path'

import GithubSlugger from 'github-slugger'
import matter from 'gray-matter'
import { z } from 'zod'

import {
  isPublishedPostSlug,
  publishedPostSlugs,
} from './public-content-routes'

const POSTS_DIR = path.join(process.cwd(), 'content/blog')

const frontmatterSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  publishedAt: z.coerce.date(),
  cover: z.string().startsWith('./').optional(),
  coverWidth: z.number().int().positive().optional(),
  coverHeight: z.number().int().positive().optional(),
  coverCaption: z.string().optional(),
})

const translatedFrontmatterSchema = z.object({
  title: z.string().min(1),
  description: z.string().min(1),
})

export interface PostCover {
  src: string
  width: number
  height: number
  caption?: string
}

export interface Post {
  slug: string
  title: string
  titleEn: string
  description?: string
  descriptionEn: string
  publishedAt: Date
  cover?: PostCover
  readingMinutes: number
  readingMinutesEn: number
  body: string
  bodyEn: string
}

export const POST_ARTICLE_START_ID = 'post-article-start'

export type PostRailNode =
  | { key: string; kind: 'tick' }
  | {
      key: string
      kind: 'landmark'
      id: string
      label: string
      variant: 'title' | 'heading'
    }

const fencePattern = /^\s{0,3}(`{3,}|~{3,})/
const headingPattern = /^\s{0,3}(#{2,3})\s+(.+?)\s*$/
const TICKS_BETWEEN_LANDMARKS = 3

function cleanHeading(raw: string) {
  return raw
    .replace(/\s+#+\s*$/, '')
    .replace(/!?(?:\[([^\]]+)\])\([^)]*\)/g, '$1')
    .replace(/[*_`~]/g, '')
    .trim()
}

// Build a deliberately even document minimap. Heading IDs use the same
// github-slugger algorithm as rehype-slug, while a fixed number of quiet ticks
// separates every landmark so prose length never changes the rail's rhythm.
export function buildPostRail(title: string, body: string, idPrefix = ''): PostRailNode[] {
  const slugger = new GithubSlugger()
  const lines = body.split(/\r?\n/)
  const nodes: PostRailNode[] = [
    {
      key: 'title',
      kind: 'landmark',
      id: POST_ARTICLE_START_ID,
      label: title,
      variant: 'title',
    },
  ]
  let index = 0
  let landmark = 0

  while (index < lines.length) {
    const line = lines[index]
    if (!line.trim()) {
      index += 1
      continue
    }

    const fence = line.match(fencePattern)?.[1]
    if (fence) {
      const closingFence = new RegExp(`^\\s{0,3}${fence[0]}{${fence.length},}\\s*$`)
      index += 1
      while (index < lines.length && !closingFence.test(lines[index])) index += 1
      if (index < lines.length) index += 1
      continue
    }

    const heading = line.match(headingPattern)
    if (heading) {
      const label = cleanHeading(heading[2])
      for (let tick = 0; tick < TICKS_BETWEEN_LANDMARKS; tick += 1) {
        nodes.push({ key: `gap-${landmark}-${tick}`, kind: 'tick' })
      }
      nodes.push({
        key: `landmark-${landmark}`,
        kind: 'landmark',
        id: `${idPrefix}${slugger.slug(label)}`,
        label,
        variant: 'heading',
      })
      landmark += 1
      index += 1
      continue
    }

    index += 1
  }

  return nodes
}

// CJK prose reads ~300 chars/min, Latin ~200 words/min
function readingMinutes(body: string): number {
  const text = body.replace(/```[\s\S]*?```/g, '')
  const cjk = (text.match(/[一-鿿぀-ヿ]/g) ?? []).length
  const words = (text.replace(/[一-鿿぀-ヿ]/g, ' ').match(/[A-Za-z0-9]+/g) ?? []).length
  return Math.max(1, Math.round(cjk / 300 + words / 200))
}

export function getPost(slug: string): Post {
  const raw = readFileSync(path.join(POSTS_DIR, slug, 'index.mdx'), 'utf8')
  const { data, content } = matter(raw)
  const fm = frontmatterSchema.parse(data)
  const translatedRaw = readFileSync(path.join(POSTS_DIR, slug, 'index.en.mdx'), 'utf8')
  const { data: translatedData, content: translatedContent } = matter(translatedRaw)
  const translatedFm = translatedFrontmatterSchema.parse(translatedData)

  let cover: PostCover | undefined
  if (fm.cover) {
    if (!fm.coverWidth || !fm.coverHeight)
      throw new Error(`${slug}: cover requires coverWidth and coverHeight`)
    cover = {
      src: `/content/blog/${slug}/${fm.cover.slice(2)}`,
      width: fm.coverWidth,
      height: fm.coverHeight,
      caption: fm.coverCaption,
    }
  }

  return {
    slug,
    title: fm.title,
    titleEn: translatedFm.title,
    description: fm.description,
    descriptionEn: translatedFm.description,
    publishedAt: fm.publishedAt,
    cover,
    readingMinutes: readingMinutes(content),
    readingMinutesEn: readingMinutes(translatedContent),
    body: content,
    bodyEn: translatedContent,
  }
}

export function isPostSlug(slug: string) {
  return isPublishedPostSlug(slug)
}

export function getAllPosts(): Post[] {
  return publishedPostSlugs
    .map((slug) => getPost(slug))
    .sort((a, b) => b.publishedAt.getTime() - a.publishedAt.getTime())
}
