// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { AmaPageView } from './ama-page'
import { AMA_TOPIC_LABELS, AMA_TOPICS } from '~/lib/ama/booking/topics'

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
  it('presents the AMA Session spec sheet in both languages', () => {
    const { container } = render(<AmaPageView />)

    expect(screen.getByText('一对一')).toBeTruthy()
    expect(screen.getByText('AMA')).toBeTruthy()
    expect(screen.getByText(/我们缺的往往不是更多建议/)).toBeTruthy()
    expect(screen.getByText(/不妨来试试/)).toBeTruthy()
    expect(container.textContent).not.toContain(
      '这个 AMA，就是留出一小时，把这些事聊清楚。',
    )
    expect(screen.getByText(/more advice usually isn’t the answer/)).toBeTruthy()

    // Price and duration read straight off the spec sheet.
    expect(screen.getAllByText('US$99').length).toBe(2)
    expect(screen.getByText('60 minutes')).toBeTruthy()
    expect(screen.getByText('60 分钟')).toBeTruthy()
    expect(container.textContent).toContain('24 hours')
    expect(container.textContent).toContain('Next 30 days')
    expect(
      screen.getByText('付款会跳到 Stripe，银行卡信息不会经过本站。'),
    ).toBeTruthy()
    expect(container.textContent).not.toContain('付款会跳到 Stripe Checkout')

    const introductionStage = container.querySelector(
      '[data-ama-introduction-stage]',
    )
    expect(introductionStage?.textContent).toContain('same three questions')
    expect(introductionStage?.textContent).not.toContain('US$99')
    expect(introductionStage?.textContent).not.toContain('Who you are talking to')

    const nameplate = container.querySelector('.spec-nameplate')
    expect(nameplate?.textContent).toContain('US$99')
    expect(introductionStage?.contains(nameplate)).toBe(false)
  })

  it('lists all seven topics in both languages', () => {
    const { container } = render(<AmaPageView />)

    expect(AMA_TOPICS.length).toBe(7)
    for (const topic of AMA_TOPICS) {
      const label = AMA_TOPIC_LABELS[topic]
      expect(screen.getAllByText(label.zh).length).toBeGreaterThanOrEqual(1)
      expect(screen.getAllByText(label.en).length).toBeGreaterThanOrEqual(1)
    }

    expect(container.textContent).toContain('software factory')
    for (const tool of ['Linear', 'Codex', 'Claude Code', 'Slack', 'Cursor']) {
      expect(container.textContent).toContain(tool)
      expect(
        container.querySelectorAll(`[data-ama-product-name="${tool}"]`),
      ).toHaveLength(2)
    }
    expect(container.querySelectorAll('.ama-product-logo')).toHaveLength(10)
    expect(
      container.querySelectorAll(
        '[data-ama-product-name="Codex"] img[src="/images/codex.svg"]',
      ),
    ).toHaveLength(2)
  })

  it('states the 24 hour policy and carries the testimonials', () => {
    const { container } = render(<AmaPageView />)

    expect(container.textContent).toContain('If we’re at least 24 hours out')
    expect(container.textContent).toContain('refunds are no longer automatic')
    expect(container.textContent).toContain('离开始还有 24 小时以上')

    expect(
      screen.getByText(/目前我已经拿到了 3 个 offer，选择了一个/),
    ).toBeTruthy()
    expect(
      screen.getByText(/I have since received three offers and accepted one/),
    ).toBeTruthy()
    expect(screen.getByText(/公司立刻把我转正/)).toBeTruthy()
    expect(
      screen.getByText(/skipping the three month probation/),
    ).toBeTruthy()
    expect(screen.getByText(/解答了我很多问题/)).toBeTruthy()
    expect(screen.getAllByText('An engineer, 2023').length).toBe(2)
    expect(screen.getByText('一位大学生，2026')).toBeTruthy()
    expect(screen.getByText('An AMA guest, 2026')).toBeTruthy()
    expect(container.textContent).not.toContain('一位来访者，2026')
    expect(container.textContent).not.toContain('这 300')
    expect(container.textContent).not.toContain('¥300')
  })

  it('links both locale CTAs to the booking flow and nothing legacy', () => {
    const { container } = render(<AmaPageView />)

    const zhCtas = screen.getAllByRole('link', { name: '约个时间' })
    const enCtas = screen.getAllByRole('link', { name: 'Book an hour' })

    expect(zhCtas).toHaveLength(2)
    expect(enCtas).toHaveLength(2)
    for (const link of zhCtas) expect(link.getAttribute('href')).toBe('/ama/book')
    for (const link of enCtas) expect(link.getAttribute('href')).toBe('/en/ama/book')

    const ctaGroups = container.querySelectorAll('.ama-booking-cta')
    expect(ctaGroups).toHaveLength(2)
    expect(ctaGroups[0]?.nextElementSibling?.getAttribute('aria-labelledby')).toBe(
      'ama-who-heading',
    )

    const html = container.innerHTML.toLowerCase()
    expect(html).not.toContain('alipay')
    expect(html).not.toContain('cal.com')
  })
})
