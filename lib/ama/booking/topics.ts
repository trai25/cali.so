import { AMA_TOPICS, type AmaTopic } from './policy'

export const AMA_TOPIC_LABELS: Record<AmaTopic, { zh: string; en: string }> = {
  engineering: { zh: '工程与全栈开发', en: 'Engineering and full-stack' },
  'product-design': { zh: '产品与界面设计', en: 'Product and interface design' },
  career: { zh: '职业与出海发展', en: 'Career and working abroad' },
  'indie-business': { zh: '独立产品与创业', en: 'Indie products and startups' },
  'team-leadership': { zh: '团队与领导力', en: 'Teams and leadership' },
  'something-else': { zh: '其他话题', en: 'Something else' },
}

export { AMA_TOPICS }
export type { AmaTopic }
