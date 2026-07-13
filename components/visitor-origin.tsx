'use client'

import { useEffect, useState } from 'react'

import { T } from '~/lib/i18n'
import { parseVisitorOrigin, type VisitorOrigin } from '~/lib/visitor-geo'

const SENT_KEY = 'cali:visitor-origin:sent:v1'
const VALUE_KEY = 'cali:visitor-origin:value:v1'
const VISIT_DEDUPE_WINDOW = 30 * 60 * 1000
let visitorRequest: Promise<VisitorOrigin | null> | null = null

function countryName(country: string, locale: string) {
  try {
    return new Intl.DisplayNames([locale], { type: 'region' }).of(country) ?? country
  } catch {
    return country
  }
}

function readStoredOrigin(storage: Storage): VisitorOrigin | null {
  const value = storage.getItem(VALUE_KEY)
  if (!value || value === 'none') return null

  try {
    return parseVisitorOrigin(JSON.parse(value))
  } catch {
    return null
  }
}

async function postVisitorOrigin() {
  try {
    const response = await fetch('/api/visitor', {
      method: 'POST',
      credentials: 'same-origin',
      cache: 'no-store',
      headers: { Accept: 'application/json' },
    })
    if (!response.ok) return null

    const payload: unknown = await response.json()
    if (!payload || typeof payload !== 'object' || !('visitor' in payload)) return null
    return parseVisitorOrigin((payload as { visitor: unknown }).visitor)
  } catch {
    return null
  }
}

export function VisitorOrigin() {
  const [visitor, setVisitor] = useState<VisitorOrigin | null>(null)

  useEffect(() => {
    const privacyNavigator = navigator as Navigator & { globalPrivacyControl?: boolean }
    if (navigator.doNotTrack === '1' || privacyNavigator.globalPrivacyControl === true) return

    let storage: Storage
    try {
      storage = window.sessionStorage
      const stored = readStoredOrigin(storage)
      if (stored) {
        setVisitor(stored)
        return
      }

      const sentAt = Number(window.localStorage.getItem(SENT_KEY))
      const visitAge = Date.now() - sentAt
      if (
        Number.isFinite(sentAt) &&
        visitAge >= 0 &&
        visitAge < VISIT_DEDUPE_WINDOW &&
        !visitorRequest
      ) {
        return
      }
      window.localStorage.setItem(SENT_KEY, String(Date.now()))
    } catch {
      return
    }

    let active = true
    visitorRequest ??= postVisitorOrigin().then((origin) => {
      try {
        // A null sentinel prevents reloads in the same tab from counting again,
        // including when the store or geolocation headers are unavailable.
        storage.setItem(VALUE_KEY, origin ? JSON.stringify(origin) : 'none')
      } catch {
        // The footer remains absent when session storage becomes unavailable.
      }
      return origin
    })
    visitorRequest.then((origin) => {
      if (active) setVisitor(origin)
    })

    return () => {
      active = false
    }
  }, [])

  const zhCountry = visitor ? countryName(visitor.country, 'zh-CN') : ''
  const enCountry = visitor ? countryName(visitor.country, 'en') : ''
  const zhLocation = visitor?.city ? `${visitor.city}，${zhCountry}` : zhCountry
  const enLocation = visitor?.city ? `${visitor.city}, ${enCountry}` : enCountry

  return (
    <p
      className="footer-visitor-origin"
      data-visible={visitor ? '' : undefined}
      aria-hidden={visitor ? undefined : true}
    >
      {visitor ? (
        <T zh={`上一位访客来自 ${zhLocation}`} en={`Last visitor from ${enLocation}`} />
      ) : (
        <>&nbsp;</>
      )}
    </p>
  )
}
