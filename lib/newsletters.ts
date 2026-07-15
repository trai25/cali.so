import { readFileSync } from 'node:fs'
import path from 'node:path'

import matter from 'gray-matter'
import { z } from 'zod'

import { type ArchivedNewsletterId } from './public-content-routes'

export {
  archivedNewsletterIds,
  isArchivedNewsletterId,
  type ArchivedNewsletterId,
} from './public-content-routes'

const NEWSLETTERS_DIR = path.join(process.cwd(), 'content/newsletters')

const newsletterFrontmatterSchema = z.object({
  title: z.string().min(1),
  description: z.string().min(1),
})

export const archivedNewsletterImages = {
  '/content/newsletters/1/cover.png': { width: 1200, height: 675 },
  '/content/newsletters/1/post-rss.png': { width: 1200, height: 675 },
  '/content/newsletters/1/post-pointer.png': { width: 1200, height: 675 },
  '/content/newsletters/1/post-upstash.png': { width: 1200, height: 675 },
  '/content/newsletters/1/comments.png': { width: 1064, height: 1182 },
  '/content/newsletters/1/comments-mobile.png': { width: 1190, height: 1372 },
  '/content/newsletters/1/guestbook.png': { width: 1582, height: 1256 },
  '/content/newsletters/1/tutorial-dropdown.jpg': { width: 480, height: 360 },
  '/content/newsletters/1/tutorial-animation.jpg': { width: 480, height: 360 },
} as const

export type ArchivedNewsletter = {
  id: ArchivedNewsletterId
  title: string
  description: string
  titleEn: string
  descriptionEn: string
  body: string
  bodyEn: string
}

const archivedNewsletterCache = new Map<
  ArchivedNewsletterId,
  ArchivedNewsletter
>()

export function getArchivedNewsletter(
  id: ArchivedNewsletterId,
): ArchivedNewsletter {
  const cached = archivedNewsletterCache.get(id)
  if (cached) return cached

  const raw = readFileSync(path.join(NEWSLETTERS_DIR, id, 'index.mdx'), 'utf8')
  const { data, content } = matter(raw)
  const frontmatter = newsletterFrontmatterSchema.parse(data)
  const englishRaw = readFileSync(
    path.join(NEWSLETTERS_DIR, id, 'index.en.mdx'),
    'utf8',
  )
  const { data: englishData, content: englishContent } = matter(englishRaw)
  const englishFrontmatter = newsletterFrontmatterSchema.parse(englishData)

  const newsletter = {
    id,
    ...frontmatter,
    titleEn: englishFrontmatter.title,
    descriptionEn: englishFrontmatter.description,
    body: content,
    bodyEn: englishContent,
  }

  archivedNewsletterCache.set(id, newsletter)
  return newsletter
}
