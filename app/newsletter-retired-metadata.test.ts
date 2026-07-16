import { describe, expect, it } from 'vitest'

import { newsletterRetiredMetadata } from './_views/newsletter-retired-page'

describe('retired newsletter confirmation metadata', () => {
  it('matches the visible localized explanation and remains private', () => {
    const chinese = newsletterRetiredMetadata('zh')
    const english = newsletterRetiredMetadata('en')

    expect(chinese).toMatchObject({
      title: 'Newsletter 确认链接已停用',
      description:
        '这个旧链接不会再读取或更新任何订阅信息。Newsletter 服务已经停止，你仍然可以通过 RSS 阅读网站更新。',
      robots: { index: false, follow: false },
    })
    expect(english).toMatchObject({
      title: 'Newsletter confirmation is retired',
      description:
        'This old link no longer reads or updates subscriber information. The newsletter service has ended, but site updates remain available through RSS.',
      robots: { index: false, follow: false },
    })
  })
})
