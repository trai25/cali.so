const BASE_URL = 'https://og.zolplay.com'
const PRIVATE_HOST_SUFFIXES = ['.internal', '.invalid', '.local', '.localhost', '.test']
const HAN = /\p{Script=Han}/u

function isNonPublicIpv4(hostname) {
  const octets = hostname.split('.').map(Number)
  if (octets.length !== 4 || octets.some((octet) => !Number.isInteger(octet))) return false

  const [first, second] = octets
  return (
    first === 0 ||
    first === 10 ||
    first === 127 ||
    (first === 100 && second >= 64 && second <= 127) ||
    (first === 169 && second === 254) ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 0 && octets[2] === 0) ||
    (first === 192 && second === 0 && octets[2] === 2) ||
    (first === 192 && second === 168) ||
    (first === 192 && second === 88 && octets[2] === 99) ||
    (first === 198 && (second === 18 || second === 19)) ||
    (first === 198 && second === 51 && octets[2] === 100) ||
    (first === 203 && second === 0 && octets[2] === 113) ||
    first >= 224
  )
}

function ipv6Hextets(hostname) {
  const address = hostname.replace(/^\[|\]$/g, '').toLowerCase()
  const [head = '', tail = ''] = address.split('::')
  const leading = head ? head.split(':') : []
  const trailing = tail ? tail.split(':') : []
  const missing = 8 - leading.length - trailing.length
  if (missing < 0 || (!address.includes('::') && missing !== 0)) return null

  const hextets = [
    ...leading,
    ...Array.from({ length: missing }, () => '0'),
    ...trailing,
  ].map((part) => Number.parseInt(part, 16))

  return hextets.length === 8 && hextets.every((part) => Number.isInteger(part))
    ? hextets
    : null
}

function isNonPublicIpv6(hostname) {
  const hextets = ipv6Hextets(hostname)
  if (!hextets) return true

  const [first, second, third] = hextets
  const globallyRoutable = first >= 0x2000 && first <= 0x3fff
  const documentation =
    (first === 0x2001 && second === 0x0db8) ||
    (first === 0x3fff && (second & 0xf000) === 0)
  const benchmarking =
    first === 0x2001 && second === 0x0002 && third === 0
  const orchid =
    first === 0x2001 &&
    ((second & 0xfff0) === 0x0010 || (second & 0xfff0) === 0x0020)

  if (!globallyRoutable || documentation || benchmarking || orchid) return true

  if (first === 0x2002) {
    const embeddedIpv4 = [second >> 8, second & 0xff, third >> 8, third & 0xff].join('.')
    return isNonPublicIpv4(embeddedIpv4)
  }

  return false
}

function publicHttpUrl(target) {
  try {
    const url = new URL(target)
    const hostname = url.hostname.toLowerCase()
    const privateHostname =
      hostname === 'localhost' ||
      PRIVATE_HOST_SUFFIXES.some((suffix) => hostname.endsWith(suffix))

    if (
      (url.protocol !== 'http:' && url.protocol !== 'https:') ||
      url.username ||
      url.password ||
      (!hostname.includes('.') && !hostname.includes(':')) ||
      privateHostname ||
      isNonPublicIpv4(hostname) ||
      (hostname.includes(':') && isNonPublicIpv6(hostname))
    ) {
      return null
    }

    return url
  } catch {
    return null
  }
}

export function ogZolplayUrl(endpoint, target) {
  const url = publicHttpUrl(target)
  return url ? `${BASE_URL}/${endpoint}/${encodeURIComponent(url.href)}` : null
}

function normalizePreviewText(value) {
  if (typeof value !== 'string' || !value.trim()) return undefined
  return value.trim().replace(/\s*[—–]\s*/gu, ' - ')
}

function localizedField(freshValue, previousSource, previousEnglish) {
  const fresh = normalizePreviewText(freshValue)
  const previous = normalizePreviewText(previousSource)
  const previousEn = normalizePreviewText(previousEnglish)

  if (fresh && !HAN.test(fresh) && previous && HAN.test(previous)) {
    return { source: previous, english: fresh }
  }

  let source = fresh ?? previous
  let english = previousEn

  if (source && HAN.test(source) && !english) {
    if (previous && !HAN.test(previous)) english = previous
  }

  return { source, english }
}

function hasOgImage(value) {
  return (
    Array.isArray(value) &&
    value.some(
      (image) =>
        typeof image === 'object' &&
        image !== null &&
        typeof image.url === 'string' && image.url.trim() !== '',
    )
  )
}

export function normalizeOgMetadata(target, metadata, previous) {
  const url = publicHttpUrl(target)
  if (!url || typeof metadata !== 'object' || metadata === null) return undefined

  const title = localizedField(metadata.ogTitle, previous?.title, previous?.titleEn)
  const description = localizedField(
    metadata.ogDescription,
    previous?.description,
    previous?.descriptionEn,
  )

  return {
    domain: url.hostname,
    title: title.source,
    titleEn: title.english,
    description: description.source,
    descriptionEn: description.english,
    hasImage: hasOgImage(metadata.ogImage),
  }
}
