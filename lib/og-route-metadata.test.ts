import type { Metadata } from 'next'
import { describe, expect, it } from 'vitest'

import { localeMetadata } from './locale-metadata'
import { publicPageMetadata } from './public-page-metadata'

function imageAlt(metadata: Metadata) {
  const images = metadata.openGraph?.images
  const image = Array.isArray(images) ? images[0] : images
  return typeof image === 'object' && image && 'alt' in image ? image.alt : undefined
}

function metadataFor(
  locale: 'zh' | 'en',
  path: string,
  title: string,
  description: string,
) {
  return localeMetadata({ locale, path, title, description })
}

describe('social OG image metadata', () => {
  it('does not repeat Cali’s name in the homepage artwork description', () => {
    const chinese = publicPageMetadata.home.zh
    const english = publicPageMetadata.home.en

    expect(imageAlt(metadataFor('zh', '/', chinese.title, chinese.description))).toBe(
      'Cali Castle。设计工程师、Agent 指挥官、创意总监。',
    )
    expect(imageAlt(metadataFor('en', '/', english.title, english.description))).toBe(
      'Cali Castle. Design Engineer. Agent Orchestrator. Creative Director.',
    )
  })

  it.each([
    [
      'zh',
      '/blog',
      publicPageMetadata.blog.zh,
      '写作 · Cali Castle。Cali 关于设计、工程、产品，以及一路上在意的人和事的文章。',
    ],
    [
      'en',
      '/blog',
      publicPageMetadata.blog.en,
      'Writing · Cali Castle. Essays by Cali about design, engineering, products, and the people and ideas that matter along the way.',
    ],
    [
      'zh',
      '/photos',
      publicPageMetadata.photos.zh,
      '照片 · Cali Castle。Cali 在工作、生活和旅途中留下的一些瞬间。',
    ],
    [
      'en',
      '/photos',
      publicPageMetadata.photos.en,
      'Photos · Cali Castle. Moments Cali has kept from work, life, and everywhere in between.',
    ],
    [
      'zh',
      '/projects',
      publicPageMetadata.projects.zh,
      '项目 · Cali Castle。这些年做过的产品、开源工具和小实验。有些实用，有些只是好玩，但每一个我都认真做过。',
    ],
    [
      'en',
      '/projects',
      publicPageMetadata.projects.en,
      'Projects · Cali Castle. Products, open-source tools, and small experiments I have made over the years. Some useful, some playful, all made with care.',
    ],
  ] as const)(
    'describes the %s %s artwork with its own content',
    (locale, path, copy, expected) => {
      expect(imageAlt(metadataFor(locale, path, copy.title, copy.description))).toBe(expected)
    },
  )

  it('describes article and newsletter artwork with the localized title', () => {
    expect(
      imageAlt(
        metadataFor(
          'zh',
          '/blog/do-buttons-need-pointer-cursors',
          '按钮真的需要手指光标吗？',
          '文章摘要',
        ),
      ),
    ).toBe('按钮真的需要手指光标吗？ · Cali Castle')
    expect(
      imageAlt(
        metadataFor(
          'en',
          '/newsletters/1',
          'Cali.so Monthly Update Newsletter 01',
          'Archive summary',
        ),
      ),
    ).toBe('Cali.so Monthly Update Newsletter 01 · Cali Castle')
  })
})
