import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'

import matter from 'gray-matter'
import { z } from 'zod'

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

export interface PostCover {
  src: string
  width: number
  height: number
  caption?: string
}

export interface Post {
  slug: string
  title: string
  description?: string
  publishedAt: Date
  cover?: PostCover
  readingMinutes: number
  body: string
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
    description: fm.description,
    publishedAt: fm.publishedAt,
    cover,
    readingMinutes: readingMinutes(content),
    body: content,
  }
}

export function getAllPosts(): Post[] {
  return readdirSync(POSTS_DIR, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => getPost(e.name))
    .sort((a, b) => b.publishedAt.getTime() - a.publishedAt.getTime())
}
