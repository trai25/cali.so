'use client'

import { usePathname, useSearchParams } from 'next/navigation'
import { useEffect, useState } from 'react'

import { Button } from '~/components/ui/button'
import { Elevated } from '~/lib/elevated'
import { localePath, type Locale } from '~/lib/locale-route'

const SUGGESTION_COPY = {
  zh: {
    regionLabel: '语言建议',
    message: '是否切换到中文浏览？',
    switchLabel: '切换到中文',
    stayLabel: 'Continue in English',
    language: 'zh-CN',
    stayLanguage: 'en',
  },
  en: {
    regionLabel: 'Language suggestion',
    message: 'Would you prefer to view this page in English?',
    switchLabel: 'View in English',
    stayLabel: '继续使用中文',
    language: 'en',
    stayLanguage: 'zh-CN',
  },
} as const satisfies Record<
  Locale,
  {
    regionLabel: string
    message: string
    switchLabel: string
    stayLabel: string
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
  const searchParams = useSearchParams()
  const [suggestedLocale, setSuggestedLocale] = useState<Locale | null>(null)
  const [hash, setHash] = useState('')

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
    window.addEventListener('storage', resolveSuggestion)
    return () => window.removeEventListener('storage', resolveSuggestion)
  }, [locale])

  useEffect(() => {
    const updateHash = () => setHash(window.location.hash)
    updateHash()
    window.addEventListener('hashchange', updateHash)
    return () => window.removeEventListener('hashchange', updateHash)
  }, [])

  if (!suggestedLocale) return null

  const copy = SUGGESTION_COPY[suggestedLocale]
  // useSearchParams keeps this render current, while location.search retains
  // the browser's exact escaping and parameter order for the full navigation.
  const search = searchParams.toString() ? window.location.search : ''
  const currentPath = `${pathname}${search}${hash}`
  const stay = () => {
    rememberLocale(locale)
    setSuggestedLocale(null)
  }

  return (
    <div className="locale-suggestion-positioner">
      <Elevated
        offset={2}
        shadowLevel={3}
        role="region"
        aria-label={copy.regionLabel}
        aria-live="polite"
        aria-atomic="true"
        lang={copy.language}
        data-locale-suggestion={suggestedLocale}
        className="locale-suggestion"
      >
        <p className="locale-suggestion-copy">{copy.message}</p>
        <div className="locale-suggestion-actions">
          <Button asChild size="lg" expandHitArea>
            <a
              href={localePath(suggestedLocale, currentPath)}
              onClick={() => rememberLocale(suggestedLocale)}
            >
              {copy.switchLabel}
            </a>
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="lg"
            expandHitArea
            lang={copy.stayLanguage}
            onClick={stay}
          >
            {copy.stayLabel}
          </Button>
        </div>
      </Elevated>
    </div>
  )
}
