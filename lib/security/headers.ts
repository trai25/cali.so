const isDevelopment = process.env.NODE_ENV === 'development'

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

function contentSecurityPolicy(
  scriptSources: string,
  styleSources: string,
  {
    formActionSources = "'self'",
    connectSources = '',
  }: { formActionSources?: string; connectSources?: string } = {},
) {
  return [
    "default-src 'self'",
    "base-uri 'self'",
    `form-action ${formActionSources}`,
    "frame-ancestors 'none'",
    "object-src 'none'",
    `script-src ${scriptSources}`,
    "script-src-attr 'none'",
    `style-src ${styleSources}`,
    `img-src 'self' data: blob: https://og.zolplay.com${optionalMediaImageSource()}`,
    "font-src 'self' data:",
    `connect-src 'self'${connectSources}`,
    "media-src 'self' blob:",
    "worker-src 'self' blob:",
    "frame-src 'none'",
    "manifest-src 'self'",
  ].join('; ')
}

// Static policies keep the admin's prerendered shell cacheable. Its former
// nonce policy was retired in July 2026: nonces require dynamic rendering,
// which is incompatible with instant navigation. No Clerk provider origins
// are needed; the Google settings page extends only the form destination.
const publicContentSecurityPolicy = contentSecurityPolicy(
  `'self' 'unsafe-inline'${isDevelopment ? " 'unsafe-eval'" : ''}`,
  "'self' 'unsafe-inline'",
)

const googleOAuthFormContentSecurityPolicy = contentSecurityPolicy(
  `'self' 'unsafe-inline'${isDevelopment ? " 'unsafe-eval'" : ''}`,
  "'self' 'unsafe-inline'",
  { formActionSources: "'self' https://accounts.google.com" },
)

export const googleOAuthFormSecurityHeader = {
  key: 'Content-Security-Policy',
  value: googleOAuthFormContentSecurityPolicy,
} as const

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
