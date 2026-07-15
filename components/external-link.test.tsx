// @vitest-environment jsdom

import { cleanup, fireEvent, render, waitFor } from '@testing-library/react'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'

import { ExternalLink } from './external-link'

beforeAll(() => {
  class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  }

  globalThis.ResizeObserver = ResizeObserver
})

afterEach(() => {
  cleanup()
  delete document.documentElement.dataset.locale
})

describe('external link preview card', () => {
  it('shows localized rich metadata and a fixed Open Graph image slot', async () => {
    document.documentElement.dataset.locale = 'en'
    const href = 'https://example.com/articles/design'
    const { getByRole } = render(
      <ExternalLink
        href={href}
        favicon="https://og.zolplay.com/favicon/https%3A%2F%2Fexample.com%2Farticles%2Fdesign"
        preview={{
          domain: 'example.com',
          title: '设计文章',
          titleEn: 'A design article',
          description: '关于设计的文章。',
          descriptionEn: 'An article about design.',
          hasImage: true,
        }}
      >
        Example
      </ExternalLink>,
    )

    fireEvent.focus(getByRole('link'))

    await waitFor(() => {
      const card = document.querySelector('.link-card')
      expect(card).not.toBeNull()
      expect(card?.classList.contains('link-card-with-image')).toBe(true)
      expect(card?.textContent).toContain('example.com')
      expect(card?.textContent).toContain('A design article')
      expect(card?.textContent).toContain('An article about design.')
      const image = card?.querySelector('.link-card-image')
      expect(image?.getAttribute('src')).toBe(
        'https://og.zolplay.com/image/https%3A%2F%2Fexample.com%2Farticles%2Fdesign',
      )
      expect(image?.getAttribute('width')).toBe('232')
      expect(image?.getAttribute('height')).toBe('131')
    })
  })

  it('marks a failed inline favicon without changing its slot', () => {
    const { getByRole } = render(
      <ExternalLink
        href="https://example.com"
        favicon="https://og.zolplay.com/favicon/https%3A%2F%2Fexample.com%2F"
      >
        Example
      </ExternalLink>,
    )

    const icon = getByRole('link').querySelector('img')!
    fireEvent.error(icon)

    expect(icon.dataset.failed).toBe('true')
    expect(icon.getAttribute('width')).toBe('14')
    expect(icon.getAttribute('height')).toBe('14')
  })
})
