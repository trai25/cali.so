export const seo = {
  title: 'Cali Castle | 开发者、设计师、细节控、创始人',
  description:
    '我叫 Cali，一名开发者，设计师，细节控，同时也是佐玩创始人，目前带领着佐玩致力于创造一个充满创造力的工作环境，同时鼓励团队创造影响世界的产品。',
  url: new URL(
    process.env.NODE_ENV === 'production' ? 'https://cali.so' : 'http://localhost:3199',
  ),
} as const

export const seoEn = {
  title: 'Cali Castle | Developer, designer, and founder',
  description:
    "I'm Cali, a developer, designer, and founder of Zolplay. I lead the team and still spend most of my time making products.",
  url: seo.url,
} as const
