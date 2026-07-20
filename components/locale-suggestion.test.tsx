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
    ).toContain('View in English?')
    const switchButton = screen.getByRole('button', { name: 'View in English' })
    expect(switchButton.textContent).toBe('English')
    expect(screen.getByText('PREF / EN')).not.toBeNull()
  })

  it('prefers a saved site language over the browser language', async () => {
    navigation.pathname = '/en/ama'
    window.history.replaceState({}, '', '/en/ama')
    window.localStorage.locale = 'zh'
    setBrowserLanguages(['en-US'])

    render(<LocaleSuggestion locale="en" />)

    expect(
      (await screen.findByRole('region', { name: '语言建议' })).textContent,
    ).toContain('切换到中文？')
    expect(
      screen.getByRole('button', { name: '切换到中文' }),
    ).not.toBeNull()
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

  it('remembers the language when switching', async () => {
    window.history.replaceState({}, '', '/ama?source=newsletter#details')
    setBrowserLanguages(['en-GB'])
    render(<LocaleSuggestion locale="zh" />)

    const switchButton = await screen.findByRole('button', {
      name: 'View in English',
    })
    fireEvent.click(switchButton)
    expect(window.localStorage.locale).toBe('en')
  })

  it('recognizes Chinese browser language variants', async () => {
    navigation.pathname = '/en/projects'
    window.history.replaceState({}, '', '/en/projects')
    setBrowserLanguages(['zh-Hant-HK', 'en-US'])

    render(<LocaleSuggestion locale="en" />)

    expect(
      (await screen.findByRole('region', { name: '语言建议' })).textContent,
    ).toContain('切换到中文？')
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

  it('ignores cross-tab storage changes for unrelated keys', async () => {
    setBrowserLanguages(['ja-JP'])
    render(<LocaleSuggestion locale="zh" />)
    window.localStorage.locale = 'en'

    fireEvent(
      window,
      new StorageEvent('storage', { key: 'theme', newValue: 'dark' }),
    )
    expect(screen.queryByRole('region')).toBeNull()

    fireEvent(
      window,
      new StorageEvent('storage', { key: 'locale', newValue: 'en' }),
    )
    expect(
      await screen.findByRole('region', { name: 'Language suggestion' }),
    ).not.toBeNull()
  })
})
