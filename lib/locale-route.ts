export type Locale = 'zh' | 'en'

const ENGLISH_PREFIX = '/en'

function splitPathSuffix(path: string) {
  const suffixIndex = path.search(/[?#]/)
  if (suffixIndex === -1) return { pathname: path, suffix: '' }
  return {
    pathname: path.slice(0, suffixIndex),
    suffix: path.slice(suffixIndex),
  }
}

function assertSafePathname(pathname: string) {
  if (
    !pathname.startsWith('/') ||
    pathname.startsWith('//') ||
    pathname.includes('\\') ||
    pathname.includes('\0') ||
    /[\u0000-\u001f\u007f]/.test(pathname)
  ) {
    throw new Error('Invalid locale path')
  }

  const segments = pathname.split('/')
  const finalSegment = segments.length - 1

  for (const [index, segment] of segments.entries()) {
    if (segment === '' && index !== 0 && index !== finalSegment) {
      throw new Error('Invalid locale path')
    }

    let decoded: string
    try {
      decoded = decodeURIComponent(segment)
    } catch {
      throw new Error('Invalid locale path')
    }

    if (
      decoded === '.' ||
      decoded === '..' ||
      decoded.includes('/') ||
      decoded.includes('\\') ||
      /[\u0000-\u001f\u007f]/.test(decoded)
    ) {
      throw new Error('Invalid locale path')
    }
  }
}

function normalizePathname(pathname: string) {
  if (!pathname || pathname === '/') return '/'
  assertSafePathname(pathname)
  return pathname
}

export function localeFromPathname(pathname: string): Locale {
  const normalized = normalizePathname(splitPathSuffix(pathname).pathname)
  return normalized === ENGLISH_PREFIX || normalized.startsWith(`${ENGLISH_PREFIX}/`)
    ? 'en'
    : 'zh'
}

export function unlocalizedPathname(pathname: string) {
  const normalized = normalizePathname(splitPathSuffix(pathname).pathname)

  if (normalized === ENGLISH_PREFIX || normalized === `${ENGLISH_PREFIX}/`) return '/'
  if (normalized.startsWith(`${ENGLISH_PREFIX}/`)) {
    return normalized.slice(ENGLISH_PREFIX.length)
  }
  return normalized
}

export function localePath(locale: Locale, path: string) {
  const { pathname, suffix } = splitPathSuffix(path)
  const unlocalized = unlocalizedPathname(pathname)

  if (locale === 'zh') return `${unlocalized}${suffix}`
  const localized = unlocalized === '/' ? ENGLISH_PREFIX : `${ENGLISH_PREFIX}${unlocalized}`
  return `${localized}${suffix}`
}
