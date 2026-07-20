'use client'

import { useLayoutEffect } from 'react'

import { LOCALE_CHANGE_EVENT } from '~/lib/locale-client'

function restoreLocale() {
  const html = document.documentElement
  let locale: string | null = null
  try {
    locale = localStorage.locale
  } catch {
    /* private mode */
  }

  if (locale === 'en') {
    html.dataset.locale = 'en'
    html.lang = 'en'
  } else {
    delete html.dataset.locale
    html.lang = 'zh-CN'
  }
  window.dispatchEvent(new Event(LOCALE_CHANGE_EVENT))
}

export function LocaleRestorer() {
  useLayoutEffect(() => {
    restoreLocale()
    window.addEventListener('storage', restoreLocale)
    return () => window.removeEventListener('storage', restoreLocale)
  }, [])

  return null
}
