import 'server-only'

import { parseVisitorOrigin, type VisitorOrigin } from '~/lib/visitor-geo'

const VISITOR_KEY = 'cali.so:previous-global-visitor:v1'
const VISITOR_TTL_SECONDS = 60 * 60 * 24 * 30
const THROTTLE_SECONDS = 2
const MAX_STORED_VALUE_LENGTH = 512
const SWAP_SCRIPT = `
local allowed = redis.call('SET', KEYS[2], '1', 'NX', 'EX', ARGV[3])
if not allowed then return nil end
return redis.call('SET', KEYS[1], ARGV[1], 'GET', 'EX', ARGV[2])
`.trim()

export interface StoreOptions {
  environment?: string
  fetcher?: typeof fetch
  url?: string
  token?: string
}

function credentials(options: StoreOptions) {
  const url = options.url ?? process.env.UPSTASH_REDIS_REST_URL
  const token = options.token ?? process.env.UPSTASH_REDIS_REST_TOKEN
  if (!url?.trim() || !token?.trim()) return null
  return { url: url.replace(/\/+$/, ''), token }
}

function parseStoredValue(value: unknown): VisitorOrigin | null {
  if (typeof value !== 'string' || value.length === 0 || value.length > MAX_STORED_VALUE_LENGTH) {
    return null
  }

  try {
    return parseVisitorOrigin(JSON.parse(value))
  } catch {
    return null
  }
}

function storeKeys(options: StoreOptions) {
  const rawEnvironment =
    options.environment ?? process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? 'development'
  const environment = rawEnvironment.toLowerCase().replace(/[^a-z0-9_-]/g, '-').slice(0, 32)
  const visitorKey = `${VISITOR_KEY}:${environment || 'unknown'}`
  return { visitorKey, throttleKey: `${visitorKey}:throttle` }
}

export async function swapVisitorOrigin(
  current: VisitorOrigin,
  options: StoreOptions = {},
): Promise<VisitorOrigin | null> {
  const store = credentials(options)
  if (!store) return null
  const safeCurrent = parseVisitorOrigin(current)
  if (!safeCurrent) return null

  const fetcher = options.fetcher ?? fetch
  const { visitorKey, throttleKey } = storeKeys(options)
  try {
    const response = await fetcher(store.url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${store.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify([
        'EVAL',
        SWAP_SCRIPT,
        '2',
        visitorKey,
        throttleKey,
        JSON.stringify(safeCurrent),
        String(VISITOR_TTL_SECONDS),
        String(THROTTLE_SECONDS),
      ]),
      cache: 'no-store',
      signal: AbortSignal.timeout(2_500),
    })
    if (!response.ok) return null

    const payload: unknown = await response.json()
    if (!payload || typeof payload !== 'object' || !('result' in payload)) return null
    return parseStoredValue((payload as { result: unknown }).result)
  } catch {
    return null
  }
}
