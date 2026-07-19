import { describe, expect, it } from 'vitest'

import { publicPageMetadata } from './public-page-metadata'

describe('public page metadata copy', () => {
  it('uses a timeless homepage title and removes the repeated name from OG artwork', () => {
    expect(publicPageMetadata.home).toEqual({
      zh: {
        title: 'Cali Castle',
        description: '设计工程师、Agent 指挥官、创意总监。',
        ogDescription: '设计工程师、Agent 指挥官、创意总监。',
      },
      en: {
        title: 'Cali Castle',
        description: 'Design Engineer. Agent Orchestrator. Creative Director.',
        ogDescription: 'Design Engineer. Agent Orchestrator. Creative Director.',
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
    expect(publicPageMetadata.ama).toEqual({
      zh: {
        title: '一对一',
        description:
          '带着你最近卡住的问题来。聊 product design、工程、职业，也聊 AI 工作流与 Coding Agents。',
      },
      en: {
        title: 'AMA',
        description:
          'Bring the thing you’re stuck on. Talk product design, engineering, career, AI workflows, or coding agents.',
      },
    })
  })

  it('keeps section descriptions within social preview budgets', () => {
    for (const section of ['blog', 'photos', 'projects', 'ama'] as const) {
      expect(publicPageMetadata[section].zh.description.length, section).toBeLessThanOrEqual(80)
      expect(publicPageMetadata[section].en.description.length, section).toBeLessThanOrEqual(160)
    }
  })
})
