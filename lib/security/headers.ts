import { createHash } from 'node:crypto'

import { PREPAINT_SCRIPT } from './inline-scripts'

const isDevelopment = process.env.NODE_ENV === 'development'

const prepaintScriptHash = `'sha256-${createHash('sha256')
  .update(PREPAINT_SCRIPT)
  .digest('base64')}'`

function optionalMediaImageSource() {
  const value = process.env.BUNNY_RENDITIONS_CDN_URL
  if (!value) return ''
  try {
    const url = new URL(value)
    return url.protocol === 'https:' && !url.username && !url.password
      ? ` ${url.origin}`
      : ''
  } catch {
    return ''
  }
}

function contentSecurityPolicy(scriptSources: string, styleSources: string) {
  return [
    "default-src 'self'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "object-src 'none'",
    `script-src ${scriptSources}`,
    "script-src-attr 'none'",
    `style-src ${styleSources}`,
    `img-src 'self' data: blob: https://www.google.com https://zolplay.com${optionalMediaImageSource()}`,
    "font-src 'self' data:",
    "connect-src 'self'",
    "media-src 'self' blob:",
    "worker-src 'self' blob:",
    "frame-src 'none'",
    "manifest-src 'self'",
  ].join('; ')
}

const publicContentSecurityPolicy = contentSecurityPolicy(
  `'self' 'unsafe-inline'${isDevelopment ? " 'unsafe-eval'" : ''}`,
  "'self' 'unsafe-inline'",
)

export function adminContentSecurityPolicy(nonce: string) {
  const nonceSource = `'nonce-${nonce}'`
  return contentSecurityPolicy(
    `'self' ${nonceSource} ${prepaintScriptHash} 'strict-dynamic'${isDevelopment ? " 'unsafe-eval'" : ''}`,
    "'self' 'unsafe-inline'",
  )
}

export const securityHeaders = [
  { key: 'Content-Security-Policy', value: publicContentSecurityPolicy },
  {
    key: 'Strict-Transport-Security',
    value: 'max-age=63072000; includeSubDomains; preload',
  },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  {
    key: 'Permissions-Policy',
    value: [
      'accelerometer=()',
      'camera=()',
      'geolocation=()',
      'gyroscope=()',
      'magnetometer=()',
      'microphone=()',
      'payment=()',
      'usb=()',
    ].join(', '),
  },
] as const
