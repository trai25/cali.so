export const publicPageMetadata = {
  home: {
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
  },
  blog: {
    zh: {
      title: '写作',
      description: 'Cali 关于设计、工程、产品，以及一路上在意的人和事的文章。',
    },
    en: {
      title: 'Writing',
      description:
        'Essays by Cali about design, engineering, products, and the people and ideas that matter along the way.',
    },
  },
  photos: {
    zh: { title: '照片', description: 'Cali 在工作、生活和旅途中留下的一些瞬间。' },
    en: {
      title: 'Photos',
      description: 'Moments Cali has kept from work, life, and everywhere in between.',
    },
  },
  projects: {
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
  },
} as const

export type PublicSection = Exclude<keyof typeof publicPageMetadata, 'home'>
