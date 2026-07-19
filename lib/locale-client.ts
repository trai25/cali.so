'use client'

import { usePathname } from 'next/navigation'
import { useSyncExternalStore } from 'react'

import { localeFromPathname, type Locale } from '~/lib/locale-route'

export type { Locale } from '~/lib/locale-route'
export { localize } from '~/lib/locale-route'

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
  const pathname = usePathname()
  const preference = useSyncExternalStore(subscribe, getSnapshot, (): Locale => 'zh')

  if (!pathname || pathname === '/admin' || pathname.startsWith('/admin/')) return preference
  return localeFromPathname(pathname)
}

