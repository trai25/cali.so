import { AMA_TOPICS, type AmaTopic } from './policy'

export const AMA_TOPIC_LABELS: Record<AmaTopic, { zh: string; en: string }> = {
  engineering: { zh: 'Web、iOS 与全栈工程', en: 'Web, iOS, and full-stack engineering' },
  'product-design': {
    zh: '产品设计与界面细节',
    en: 'Product design and interface craft',
  },
  'ai-workflows': {
    zh: 'AI 工作流与 Coding Agents',
    en: 'AI workflows and coding agents',
  },
  career: { zh: '职业发展、出海与英语学习', en: 'Career growth and going global' },
  'indie-business': {
    zh: '独立开发、创业、产品与 GTM',
    en: 'Indie development, startups, products, and GTM',
  },
  'team-leadership': {
    zh: '团队、协作与带人',
    en: 'Teams, collaboration, and leadership',
  },
  'something-else': { zh: '其他你想聊的', en: 'Anything else on your mind' },
}

export { AMA_TOPICS }
export type { AmaTopic }
