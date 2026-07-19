// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { AmaPageView } from './ama-page'
import { AMA_TOPICS } from '~/lib/ama/booking/topics'

beforeEach(() => {
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => ({
      matches: true,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  )
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('AmaPageView', () => {
  it('presents the Chinese AMA Session spec sheet without English copy', () => {
    const { container } = render(<AmaPageView locale="zh" />)

    expect(screen.getByText('一对一')).toBeTruthy()
    expect(screen.getByText(/答案越来越便宜/)).toBeTruthy()
    expect(screen.getByText(/不妨聊聊/)).toBeTruthy()
    expect(container.textContent).not.toContain(
      '这个 AMA，就是留出一小时，把这些事聊清楚。',
    )
    expect(container.textContent).not.toContain('Answers are getting cheaper')
    expect(container.textContent).not.toContain('60 minutes')

    // Price and duration read straight off the spec sheet.
    expect(screen.getByText('US$99')).toBeTruthy()
    expect(screen.getByText('60 分钟')).toBeTruthy()
    expect(container.textContent).toContain('24 小时')
    expect(container.textContent).toContain('未来 30 天')
    expect(
      screen.getByText('付款会跳到 Stripe，银行卡信息不会经过本站。'),
    ).toBeTruthy()
    expect(container.textContent).not.toContain('付款会跳到 Stripe Checkout')
  })

  it('presents the English AMA Session spec sheet without Chinese copy', () => {
    const { container } = render(<AmaPageView locale="en" />)

    expect(screen.getByText('AMA')).toBeTruthy()
    expect(screen.getByText(/Answers are getting cheaper/)).toBeTruthy()
    expect(container.textContent).not.toContain('答案越来越便宜')
    expect(container.textContent).not.toContain('60 分钟')

    expect(screen.getByText('US$99')).toBeTruthy()
    expect(screen.getByText('60 minutes')).toBeTruthy()
    expect(container.textContent).toContain('24 hours')
    expect(container.textContent).toContain('Next 30 days')

    const introductionStage = container.querySelector(
      '[data-ama-introduction-stage]',
    )
    expect(introductionStage?.textContent).toContain('AI tools are the easy part')
    expect(introductionStage?.textContent).toContain('Judgment still decides')
    expect(introductionStage?.textContent).not.toContain('Those qualities show up')
    expect(introductionStage?.textContent).not.toContain('US$99')
    expect(introductionStage?.textContent).not.toContain('Who you are talking to')

    const nameplate = container.querySelector('.spec-nameplate')
    expect(nameplate?.textContent).toContain('US$99')
    expect(introductionStage?.contains(nameplate)).toBe(false)
  })

  it('lists all seven topics in each locale', () => {
    const zh = render(<AmaPageView locale="zh" />)

    expect(AMA_TOPICS.length).toBe(7)

    for (const zhLabel of [
      'Web、iOS 与全栈工程',
      '产品判断与产品设计',
      'AI 工作流与 Coding Agents',
      '职业、出海与英语学习',
      '独立开发、创业与 GTM',
      '团队、协作与带人',
      '其他你正在想的',
    ]) {
      expect(screen.getByText(zhLabel)).toBeTruthy()
    }

    expect(zh.container.textContent).toContain('software factory')
    expect(zh.container.textContent).toContain('OpenClaw')
    expect(zh.container.textContent).toContain('PM、财务和日常运营')
    expect(zh.container.textContent).toContain('佐玩不是一人公司')
    expect(zh.container.textContent).toContain('公司文化里少不了的一部分')
    for (const tool of ['Linear', 'Codex', 'Claude Code', 'Slack', 'Cursor']) {
      expect(zh.container.textContent).toContain(tool)
      expect(
        zh.container.querySelectorAll(`[data-ama-product-name="${tool}"]`),
      ).toHaveLength(1)
    }
    expect(zh.container.querySelectorAll('.ama-product-logo')).toHaveLength(5)

    cleanup()
    const en = render(<AmaPageView locale="en" />)

    for (const enLabel of [
      'Web, iOS, and full-stack engineering',
      'Product strategy and design',
      'AI workflows and coding agents',
      'Career moves and cross-disciplinary work',
      'Startups, product building, and GTM',
      'Teams, collaboration, and leadership',
      'Anything else on your mind',
    ]) {
      expect(screen.getByText(enLabel)).toBeTruthy()
    }

    expect(en.container.textContent).toContain('self-hosted OpenClaw')
    expect(en.container.textContent).toContain('teams at Apple, Insta360')
    expect(en.container.textContent).toContain('game studios in Seattle')
    expect(en.container.textContent).toContain('Niantic, Microsoft, and Google')
    expect(en.container.textContent).toContain('Zolplay isn’t a one-person company')
    expect(en.container.textContent).not.toContain('one-person company (OPC)')
    expect(en.container.textContent).toContain('essential part of company culture')
    for (const tool of ['Linear', 'Codex', 'Claude Code', 'Slack', 'Cursor']) {
      expect(
        en.container.querySelectorAll(`[data-ama-product-name="${tool}"]`),
      ).toHaveLength(1)
    }
    expect(en.container.querySelectorAll('.ama-product-logo')).toHaveLength(5)
    expect(
      en.container.querySelectorAll(
        '[data-ama-product-name="Codex"] img[src="/images/codex.svg"]',
      ),
    ).toHaveLength(1)
  })

  it('states the 24 hour policy and carries the testimonials', () => {
    const zh = render(<AmaPageView locale="zh" />)

    expect(zh.container.textContent).toContain('离开始还有 24 小时以上')
    expect(
      screen.getByText(/目前我已经拿到了 3 个 offer，选择了一个/),
    ).toBeTruthy()
    expect(screen.getByText(/公司立刻把我转正/)).toBeTruthy()
    expect(screen.getByText(/解答了我很多问题/)).toBeTruthy()
    expect(screen.getByText('一位大学生，2026')).toBeTruthy()
    expect(zh.container.textContent).not.toContain('一位来访者，2026')
    expect(zh.container.textContent).not.toContain('这 300')
    expect(zh.container.textContent).not.toContain('¥300')

    cleanup()
    const en = render(<AmaPageView locale="en" />)

    expect(en.container.textContent).toContain('If we’re at least 24 hours out')
    expect(en.container.textContent).toContain('refunds are no longer automatic')
    expect(
      screen.getByText(/I have since received three offers and accepted one/),
    ).toBeTruthy()
    expect(
      screen.getByText(/skipping the three month probation/),
    ).toBeTruthy()
    expect(screen.getAllByText('An engineer, 2023').length).toBe(2)
    expect(screen.getByText('A university student, 2026')).toBeTruthy()
    expect(en.container.textContent).not.toContain('An AMA guest, 2026')
  })

  it('links each locale CTA to its booking flow and nothing legacy', () => {
    const zh = render(<AmaPageView locale="zh" />)

    const zhCtas = screen.getAllByRole('link', { name: '约个时间' })
    expect(zhCtas).toHaveLength(2)
    for (const link of zhCtas) expect(link.getAttribute('href')).toBe('/ama/book')
    expect(zh.container.textContent).not.toContain('Book an hour')

    const ctaGroups = zh.container.querySelectorAll('.ama-booking-cta')
    expect(ctaGroups).toHaveLength(2)
    expect(ctaGroups[0]?.nextElementSibling?.getAttribute('aria-labelledby')).toBe(
      'ama-who-heading',
    )

    cleanup()
    const en = render(<AmaPageView locale="en" />)

    const enCtas = screen.getAllByRole('link', { name: 'Book an hour' })
    expect(enCtas).toHaveLength(2)
    for (const link of enCtas) expect(link.getAttribute('href')).toBe('/en/ama/book')
    expect(en.container.textContent).not.toContain('约个时间')

    const html = en.container.innerHTML.toLowerCase()
    expect(html).not.toContain('alipay')
    expect(html).not.toContain('cal.com')
    expect(html).not.toContain('data-zh-block')
    expect(html).not.toContain('data-en-block')
  })
})
