'use client'

import { useSyncExternalStore } from 'react'

export type Locale = 'zh' | 'en'

export const LOCALE_CHANGE_EVENT = 'cali:locale-change'

function getSnapshot(): Locale {
  return document.documentElement.dataset.locale === 'en' ? 'en' : 'zh'
}

function subscribe(onStoreChange: () => void) {
  window.addEventListener(LOCALE_CHANGE_EVENT, onStoreChange)
  window.addEventListener('storage', onStoreChange)
  return () => {
    window.removeEventListener(LOCALE_CHANGE_EVENT, onStoreChange)
    window.removeEventListener('storage', onStoreChange)
  }
}

export function useLocale(): Locale {
  return useSyncExternalStore(subscribe, getSnapshot, () => 'zh')
}

export function localize(locale: Locale, zh: string, en: string) {
  return locale === 'en' ? en : zh
}
