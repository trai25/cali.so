'use client'

import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'

import { Button } from '~/components/ui/button'
import { localePath, type Locale } from '~/lib/locale-route'

const SUGGESTION_COPY = {
  zh: {
    regionLabel: '语言建议',
    message: '切换到中文？',
    switchLabel: '中文',
    switchAriaLabel: '切换到中文',
    stayLabel: 'English',
    stayAriaLabel: 'Continue in English',
    language: 'zh-CN',
    stayLanguage: 'en',
  },
  en: {
    regionLabel: 'Language suggestion',
    message: 'View in English?',
    switchLabel: 'English',
    switchAriaLabel: 'View in English',
    stayLabel: '中文',
    stayAriaLabel: '继续使用中文',
    language: 'en',
    stayLanguage: 'zh-CN',
  },
} as const satisfies Record<
  Locale,
  {
    regionLabel: string
    message: string
    switchLabel: string
    switchAriaLabel: string
    stayLabel: string
    stayAriaLabel: string
    language: string
    stayLanguage: string
  }
>

function supportedLocale(language: string): Locale | null {
  const base = language.trim().toLowerCase().split('-')[0]
  return base === 'zh' || base === 'en' ? base : null
}

function savedLocale(): Locale | null {
  try {
    return supportedLocale(localStorage.locale ?? '')
  } catch {
    return null
  }
}

function rememberLocale(locale: Locale) {
  try {
    localStorage.locale = locale
  } catch {
    /* Private browsing can make storage unavailable. */
  }
}

export function LocaleSuggestion({ locale }: { locale: Locale }) {
  const pathname = usePathname()
  const [suggestedLocale, setSuggestedLocale] = useState<Locale | null>(null)

  useEffect(() => {
    const resolveSuggestion = () => {
      const languages = navigator.languages.length
        ? navigator.languages
        : [navigator.language]
      const preferred =
        savedLocale() ??
        languages
          .map(supportedLocale)
          .find((candidate): candidate is Locale => candidate !== null)
      setSuggestedLocale(preferred && preferred !== locale ? preferred : null)
    }

    resolveSuggestion()
    const onStorage = (event: StorageEvent) => {
      if (event.key === 'locale' || event.key === null) resolveSuggestion()
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [locale])

  if (!suggestedLocale) return null

  const copy = SUGGESTION_COPY[suggestedLocale]
  const switchLocale = () => {
    rememberLocale(suggestedLocale)
    // Assigning only pathname keeps the browser-owned query and fragment while
    // localePath validates that the destination remains a local route.
    window.location.pathname = localePath(suggestedLocale, pathname)
  }
  const stay = () => {
    rememberLocale(locale)
    setSuggestedLocale(null)
  }

  return (
    <div className="locale-suggestion-positioner">
      <section
        role="region"
        aria-label={copy.regionLabel}
        aria-live="polite"
        aria-atomic="true"
        lang={copy.language}
        data-locale-suggestion={suggestedLocale}
        className="locale-suggestion"
      >
        <span aria-hidden="true" className="locale-suggestion-screw" />
        <span aria-hidden="true" className="locale-suggestion-meta">
          <span>LANG / 01</span>
          <span>PREF / {suggestedLocale.toUpperCase()}</span>
        </span>
        <p className="locale-suggestion-copy">{copy.message}</p>
        <div className="locale-suggestion-actions">
          <Button
            type="button"
            size="lg"
            expandHitArea
            aria-label={copy.switchAriaLabel}
            className="locale-suggestion-action"
            onClick={switchLocale}
          >
            {copy.switchLabel}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="lg"
            expandHitArea
            aria-label={copy.stayAriaLabel}
            className="locale-suggestion-action"
            lang={copy.stayLanguage}
            onClick={stay}
          >
            {copy.stayLabel}
          </Button>
        </div>
        <span aria-hidden="true" className="locale-suggestion-screw" />
      </section>
    </div>
  )
}
