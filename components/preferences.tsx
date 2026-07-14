'use client'

import { Monitor, Moon, Sun, Volume2, VolumeX } from 'lucide-react'
import { usePathname } from 'next/navigation'

import { PreferencesIcon } from '~/components/dock-icons'
import { useTheme } from '~/components/theme-provider'
import { useEffect, useState } from 'react'

import { DropdownContent, DropdownMenu, DropdownTrigger } from '~/components/ui/dropdown'
import { TabItem, Tabs, TabsList } from '~/components/ui/tabs'
import { T } from '~/lib/i18n'
import { LOCALE_CHANGE_EVENT, localize, useLocale } from '~/lib/locale-client'
import { localePath, type Locale } from '~/lib/locale-route'
import { playPreferenceSound, setSoundEnabled, soundEnabled } from '~/lib/sound'

function Row({ zh, en, children }: { zh: string; en: string; children: React.ReactNode }) {
  return (
    <div className="prefs-row">
      <span className="prefs-row-label">
        <T zh={zh} en={en} />
      </span>
      {children}
    </div>
  )
}

// 偏好 — the dock's preferences panel: language, theme, and UI sound,
// each as full-width fluid tabs.
export function Preferences() {
  const activeLocale = useLocale()
  const pathname = usePathname()
  const { theme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)
  const [locale, setLocale] = useState<'zh' | 'en'>('zh')
  const [sound, setSound] = useState(false)

  useEffect(() => {
    setMounted(true)
    setLocale(document.documentElement.dataset.locale === 'en' ? 'en' : 'zh')
    setSound(soundEnabled())
  }, [])

  function applyLocale(next: string) {
    const nextLocale = next as Locale
    try {
      localStorage.locale = nextLocale
    } catch {
      /* private mode */
    }
    playPreferenceSound()

    if (pathname && pathname !== '/admin' && !pathname.startsWith('/admin/')) {
      const suffix = `${window.location.search}${window.location.hash}`
      window.location.assign(localePath(nextLocale, `${pathname}${suffix}`))
      return
    }

    const html = document.documentElement
    if (nextLocale === 'en') {
      html.dataset.locale = 'en'
      html.lang = 'en'
    } else {
      delete html.dataset.locale
      html.lang = 'zh-CN'
    }
    setLocale(nextLocale)
    window.dispatchEvent(new Event(LOCALE_CHANGE_EVENT))
  }

  return (
    <DropdownMenu>
      <DropdownTrigger
        render={
          <button
            type="button"
            className="dock-item"
            aria-label={localize(activeLocale, '偏好设置', 'Preferences')}
          >
            <PreferencesIcon />
            <span className="dock-tip" aria-hidden>
              <T zh="偏好" en="Preferences" />
            </span>
          </button>
        }
      />
      <DropdownContent side="top" sideOffset={14} className="prefs-panel w-max">
        <Row zh="语言" en="Language">
          <Tabs value={mounted ? locale : activeLocale} onValueChange={applyLocale}>
            <TabsList aria-label={localize(activeLocale, '语言', 'Language')}>
              <TabItem value="zh" label="中文" />
              <TabItem value="en" label="English" />
            </TabsList>
          </Tabs>
        </Row>
        <Row zh="外观" en="Theme">
          <Tabs
            value={mounted && theme ? theme : 'system'}
            onValueChange={(v) => {
              setTheme(v)
              playPreferenceSound()
            }}
          >
            <TabsList aria-label={localize(activeLocale, '外观', 'Theme')}>
              <TabItem value="light" icon={Sun} label="" aria-label={localize(activeLocale, '浅色', 'Light')} />
              <TabItem value="system" icon={Monitor} label="" aria-label={localize(activeLocale, '系统', 'System')} />
              <TabItem value="dark" icon={Moon} label="" aria-label={localize(activeLocale, '深色', 'Dark')} />
            </TabsList>
          </Tabs>
        </Row>
        <Row zh="音效" en="Sound">
          <Tabs
            value={mounted && sound ? 'on' : 'off'}
            onValueChange={(v) => {
              const on = v === 'on'
              if (!on) playPreferenceSound()
              setSoundEnabled(on)
              setSound(on)
              if (on) playPreferenceSound()
            }}
          >
            <TabsList aria-label={localize(activeLocale, '音效', 'Sound')}>
              <TabItem value="on" icon={Volume2} label="" aria-label={localize(activeLocale, '开', 'On')} />
              <TabItem value="off" icon={VolumeX} label="" aria-label={localize(activeLocale, '关', 'Off')} />
            </TabsList>
          </Tabs>
        </Row>
      </DropdownContent>
    </DropdownMenu>
  )
}
