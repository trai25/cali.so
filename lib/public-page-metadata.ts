export const publicPageMetadata = {
  home: {
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
  ama: {
    zh: {
      title: '一对一',
      description:
        '与 Cali 的专注一小时。一场 60 分钟的一对一 AMA，聊工程、设计、职业或做产品。',
    },
    en: {
      title: 'AMA',
      description:
        'A focused hour with Cali. One 60 minute one-to-one AMA Session about engineering, design, career, or building products.',
    },
  },
} as const

export type PublicSection = Exclude<keyof typeof publicPageMetadata, 'home'>
