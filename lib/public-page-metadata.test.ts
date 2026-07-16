import { describe, expect, it } from 'vitest'

import { publicPageMetadata } from './public-page-metadata'

describe('public page metadata copy', () => {
  it('uses a timeless homepage title and removes the repeated name from OG artwork', () => {
    expect(publicPageMetadata.home).toEqual({
      zh: {
        title: 'Cali Castle',
        description: '我是 Cali，两个孩子的爸爸，也是一名热爱把细节做到刚刚好的设计工程师。',
        ogDescription: '两个孩子的爸爸，也是一名热爱把细节做到刚刚好的设计工程师。',
      },
      en: {
        title: 'Cali Castle',
        description:
          'I’m Cali, a father of two and a design engineer who loves getting the details just right.',
        ogDescription:
          'A father of two and a design engineer who loves getting the details just right.',
      },
    })
  })

  it('keeps each public section localized and content-specific', () => {
    expect(publicPageMetadata.blog).toEqual({
      zh: {
        title: '写作',
        description: 'Cali 关于设计、工程、产品，以及一路上在意的人和事的文章。',
      },
      en: {
        title: 'Writing',
        description:
          'Essays by Cali about design, engineering, products, and the people and ideas that matter along the way.',
      },
    })
    expect(publicPageMetadata.photos).toEqual({
      zh: { title: '照片', description: 'Cali 在工作、生活和旅途中留下的一些瞬间。' },
      en: {
        title: 'Photos',
        description: 'Moments Cali has kept from work, life, and everywhere in between.',
      },
    })
    expect(publicPageMetadata.projects).toEqual({
      zh: {
        title: '项目',
        description:
          '这些年做过的产品、开源工具和小实验。有些实用，有些只是好玩，但每一个我都认真做过。',
      },
      en: {
        title: 'Projects',
        description:
          'Products, open-source tools, and small experiments I have made over the years. Some useful, some playful, all made with care.',
      },
    })
  })

  it('keeps section descriptions within social preview budgets', () => {
    for (const section of ['blog', 'photos', 'projects'] as const) {
      expect(publicPageMetadata[section].zh.description.length, section).toBeLessThanOrEqual(80)
      expect(publicPageMetadata[section].en.description.length, section).toBeLessThanOrEqual(160)
    }
  })
})
