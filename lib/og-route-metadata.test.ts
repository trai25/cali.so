import { describe, expect, it } from 'vitest'

import { generateImageMetadata as englishPostImageMetadata } from '../app/(en)/en/blog/[slug]/opengraph-image'
import { generateImageMetadata as englishNewsletterImageMetadata } from '../app/(en)/en/newsletters/[id]/opengraph-image'
import { alt as englishBlogAlt } from '../app/(en)/en/blog/opengraph-image'
import { alt as englishHomeAlt } from '../app/(en)/en/opengraph-image'
import { alt as englishPhotosAlt } from '../app/(en)/en/photos/opengraph-image'
import { alt as englishProjectsAlt } from '../app/(en)/en/projects/opengraph-image'
import { generateImageMetadata as chinesePostImageMetadata } from '../app/(zh)/blog/[slug]/opengraph-image'
import { generateImageMetadata as chineseNewsletterImageMetadata } from '../app/(zh)/newsletters/[id]/opengraph-image'
import { alt as chineseBlogAlt } from '../app/(zh)/blog/opengraph-image'
import { alt as chineseHomeAlt } from '../app/(zh)/opengraph-image'
import { alt as chinesePhotosAlt } from '../app/(zh)/photos/opengraph-image'
import { alt as chineseProjectsAlt } from '../app/(zh)/projects/opengraph-image'

const size = { width: 1200, height: 630 }

describe('dynamic OG image metadata', () => {
  it('does not repeat Cali’s name in the homepage artwork description', () => {
    expect(chineseHomeAlt).toBe(
      'Cali Castle。两个孩子的爸爸，也是一名热爱把细节做到刚刚好的设计工程师。',
    )
    expect(englishHomeAlt).toBe(
      'Cali Castle. A father of two and a design engineer who loves getting the details just right.',
    )
  })

  it('describes each localized section artwork with its own content', () => {
    expect(chineseBlogAlt).toBe(
      '写作 · Cali Castle。Cali 关于设计、工程、产品，以及一路上在意的人和事的文章。',
    )
    expect(englishBlogAlt).toBe(
      'Writing · Cali Castle. Essays by Cali about design, engineering, products, and the people and ideas that matter along the way.',
    )
    expect(chinesePhotosAlt).toBe(
      '照片 · Cali Castle。Cali 在工作、生活和旅途中留下的一些瞬间。',
    )
    expect(englishPhotosAlt).toBe(
      'Photos · Cali Castle. Moments Cali has kept from work, life, and everywhere in between.',
    )
    expect(chineseProjectsAlt).toBe(
      '项目 · Cali Castle。这些年做过的产品、开源工具和小实验。有些实用，有些只是好玩，但每一个我都认真做过。',
    )
    expect(englishProjectsAlt).toBe(
      'Projects · Cali Castle. Products, open-source tools, and small experiments I have made over the years. Some useful, some playful, all made with care.',
    )
  })

  it('describes localized article artwork with the article title', () => {
    const slug = 'do-buttons-need-pointer-cursors'

    expect(chinesePostImageMetadata({ params: { slug } })).toEqual([
      {
        id: slug,
        alt: '按钮真的需要手指光标吗？ · Cali Castle',
        size,
        contentType: 'image/png',
      },
    ])
    expect(englishPostImageMetadata({ params: { slug } })).toEqual([
      {
        id: slug,
        alt: 'Do Buttons Really Need Pointer Cursors? · Cali Castle',
        size,
        contentType: 'image/png',
      },
    ])
  })

  it('describes localized newsletter artwork with the archived issue title', () => {
    expect(chineseNewsletterImageMetadata({ params: { id: '1' } })).toEqual([
      {
        id: '1',
        alt: 'Cali.so 动态更新 Newsletter 01 · Cali Castle',
        size,
        contentType: 'image/png',
      },
    ])
    expect(englishNewsletterImageMetadata({ params: { id: '1' } })).toEqual([
      {
        id: '1',
        alt: 'Cali.so Monthly Update Newsletter 01 · Cali Castle',
        size,
        contentType: 'image/png',
      },
    ])
  })
})
