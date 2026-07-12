'use client'

import { Monitor, Moon, Sun, Volume2, VolumeX } from 'lucide-react'

import { PreferencesIcon } from '~/components/dock-icons'
import { useTheme } from 'next-themes'
import { useEffect, useState } from 'react'

import { DropdownContent, DropdownMenu, DropdownTrigger } from '~/components/ui/dropdown'
import { TabItem, Tabs, TabsList } from '~/components/ui/tabs'
import { T } from '~/lib/i18n'
import { playTick, setSoundEnabled, soundEnabled } from '~/lib/sound'

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
    const html = document.documentElement
    if (next === 'en') {
      html.dataset.locale = 'en'
      html.lang = 'en'
    } else {
      delete html.dataset.locale
      html.lang = 'zh-CN'
    }
    setLocale(next as 'zh' | 'en')
    try {
      localStorage.locale = next
    } catch {
      /* private mode */
    }
    playTick()
  }

  return (
    <DropdownMenu>
      <DropdownTrigger
        render={
          <button
            type="button"
            className="dock-item"
            aria-label="偏好设置 / Preferences"
          >
            <PreferencesIcon />
            <span className="dock-tip" aria-hidden>
              <T zh="偏好" en="Preferences" />
            </span>
          </button>
        }
      />
      <DropdownContent side="top" sideOffset={14} className="prefs-panel">
        <Row zh="语言" en="Language">
          <Tabs value={mounted ? locale : 'zh'} onValueChange={applyLocale}>
            <TabsList aria-label="语言 / Language">
              <TabItem value="zh" label="中文" />
              <TabItem value="en" label="EN" />
            </TabsList>
          </Tabs>
        </Row>
        <Row zh="外观" en="Theme">
          <Tabs
            value={mounted && theme ? theme : 'system'}
            onValueChange={(v) => {
              setTheme(v)
              playTick()
            }}
          >
            <TabsList aria-label="外观 / Theme">
              <TabItem value="light" icon={Sun} label="" aria-label="浅色 / Light" />
              <TabItem value="system" icon={Monitor} label="" aria-label="系统 / System" />
              <TabItem value="dark" icon={Moon} label="" aria-label="深色 / Dark" />
            </TabsList>
          </Tabs>
        </Row>
        <Row zh="音效" en="Sound">
          <Tabs
            value={mounted && sound ? 'on' : 'off'}
            onValueChange={(v) => {
              const on = v === 'on'
              setSoundEnabled(on)
              setSound(on)
              if (on) playTick()
            }}
          >
            <TabsList aria-label="音效 / Sound">
              <TabItem value="on" icon={Volume2} label="" aria-label="开 / On" />
              <TabItem value="off" icon={VolumeX} label="" aria-label="关 / Off" />
            </TabsList>
          </Tabs>
        </Row>
      </DropdownContent>
    </DropdownMenu>
  )
}
