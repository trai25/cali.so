/** @vitest-environment jsdom */

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const navigation = vi.hoisted(() => ({ pathname: '/ama' }))

vi.mock('next/navigation', () => ({
  usePathname: () => navigation.pathname,
  useSearchParams: () => new URLSearchParams(window.location.search),
}))

import { LocaleSuggestion } from './locale-suggestion'

function setBrowserLanguages(languages: string[]) {
  Object.defineProperty(window.navigator, 'languages', {
    configurable: true,
    value: languages,
  })
}

describe('LocaleSuggestion', () => {
  beforeEach(() => {
    navigation.pathname = '/ama'
    window.history.replaceState({}, '', '/ama')
    window.localStorage.clear()
  })

  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
  })

  it('offers English when the browser prefers English on a Chinese route', async () => {
    setBrowserLanguages(['en-US', 'en'])

    render(<LocaleSuggestion locale="zh" />)

    expect(
      (await screen.findByRole('region', { name: 'Language suggestion' }))
        .textContent,
    ).toContain('Would you prefer to view this page in English?')
    expect(
      screen.getByRole('link', { name: 'View in English' }).getAttribute('href'),
    ).toBe('/en/ama')
  })

  it('prefers a saved site language over the browser language', async () => {
    navigation.pathname = '/en/ama'
    window.history.replaceState({}, '', '/en/ama')
    window.localStorage.locale = 'zh'
    setBrowserLanguages(['en-US'])

    render(<LocaleSuggestion locale="en" />)

    expect(
      (await screen.findByRole('region', { name: '语言建议' })).textContent,
    ).toContain('是否切换到中文浏览？')
    expect(
      screen.getByRole('link', { name: '切换到中文' }).getAttribute('href'),
    ).toBe('/ama')
  })

  it('remembers the current language when the visitor chooses to stay', async () => {
    setBrowserLanguages(['en-US'])
    render(<LocaleSuggestion locale="zh" />)

    fireEvent.click(await screen.findByRole('button', { name: '继续使用中文' }))

    expect(window.localStorage.locale).toBe('zh')
    await waitFor(() => {
      expect(
        screen.queryByRole('region', { name: 'Language suggestion' }),
      ).toBeNull()
    })
  })

  it('preserves the URL and remembers the language when switching', async () => {
    window.history.replaceState({}, '', '/ama?source=newsletter#details')
    setBrowserLanguages(['en-GB'])
    render(<LocaleSuggestion locale="zh" />)

    const switchLink = await screen.findByRole('link', {
      name: 'View in English',
    })
    switchLink.addEventListener('click', (event) => event.preventDefault())

    expect(switchLink.getAttribute('href')).toBe(
      '/en/ama?source=newsletter#details',
    )
    fireEvent.click(switchLink)
    expect(window.localStorage.locale).toBe('en')
  })

  it('keeps the destination current after a hash-only navigation', async () => {
    setBrowserLanguages(['en-US'])
    render(<LocaleSuggestion locale="zh" />)

    const switchLink = await screen.findByRole('link', {
      name: 'View in English',
    })
    window.history.replaceState({}, '', '/ama#pricing')
    fireEvent(window, new HashChangeEvent('hashchange'))

    await waitFor(() => {
      expect(switchLink.getAttribute('href')).toBe('/en/ama#pricing')
    })
  })

  it('recognizes Chinese browser language variants', async () => {
    navigation.pathname = '/en/projects'
    window.history.replaceState({}, '', '/en/projects')
    setBrowserLanguages(['zh-Hant-HK', 'en-US'])

    render(<LocaleSuggestion locale="en" />)

    expect(
      (await screen.findByRole('region', { name: '语言建议' })).textContent,
    ).toContain('是否切换到中文浏览？')
  })

  it('ignores unsupported browser languages', () => {
    setBrowserLanguages(['ja-JP', 'fr-FR'])

    render(<LocaleSuggestion locale="zh" />)

    expect(screen.queryByRole('region')).toBeNull()
  })

  it('does not prompt when the saved preference matches the route', () => {
    window.localStorage.locale = 'zh'
    setBrowserLanguages(['en-US'])

    render(<LocaleSuggestion locale="zh" />)

    expect(screen.queryByRole('region')).toBeNull()
  })
})
