export const seo = {
  title: 'Cali Castle | 开发者、设计师、细节控、创始人',
  description: '我是 Cali，两个孩子的爸爸，也是一名热爱把细节做到刚刚好的设计工程师。',
  url: new URL(
    process.env.NODE_ENV === 'production' ? 'https://cali.so' : 'http://localhost:3199',
  ),
} as const

export const seoEn = {
  title: 'Cali Castle | Developer, designer, and founder',
  description:
    "I'm Cali, a father of two and a design engineer who loves getting the details just right.",
  url: seo.url,
} as const
