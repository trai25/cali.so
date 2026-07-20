import 'server-only'

import { z } from 'zod'

import type { BunnyStorageConfig } from './bunny'

export const BUNNY_CONTRACT_ORIGIN = 'https://cali.so'

export type BunnyContractExpectations = {
  origin: URL
  edgeTtlSeconds: number
  browserTtlSeconds: number
}

const nonProductionMarker =
  /(^|[.-])(dev|test|testing|stage|staging|preview|sandbox|nonprod|non-production)([.-]|$)/i
const productionMarker = /(^|[.-])(prod|production|live)([.-]|$)/i

const storageZoneSchema = z.object({
  Id: z.number().int().positive(),
  Name: z.string().trim().min(1).nullable(),
  Deleted: z.boolean().optional(),
})

const hostnameSchema = z.object({
  Value: z.string().trim().min(1).nullable().optional(),
  ForceSSL: z.boolean().optional(),
})

const edgeRuleTriggerSchema = z.object({
  Type: z.number().int(),
  PatternMatches: z.array(z.string()).nullable().optional(),
  PatternMatchingType: z.number().int(),
})

const edgeRuleSchema = z.object({
  ActionType: z.number().int(),
  TriggerMatchingType: z.number().int(),
  Enabled: z.boolean(),
  Triggers: z.array(edgeRuleTriggerSchema).nullable().optional(),
})

const pullZoneSchema = z.object({
  Id: z.number().int().positive(),
  Name: z.string().trim().min(1).nullable().optional(),
  OriginUrl: z.string().trim().nullable().optional(),
  Enabled: z.boolean(),
  Suspended: z.boolean(),
  StorageZoneId: z.number().int().nullable().optional(),
  Hostnames: z.array(hostnameSchema).nullable().optional(),
  CacheControlMaxAgeOverride: z.number().int().nullable().optional(),
  CacheControlPublicMaxAgeOverride: z.number().int().nullable().optional(),
  EdgeRules: z.array(edgeRuleSchema).nullable().optional(),
})

const storageZonesSchema = z
  .union([
    z.array(storageZoneSchema),
    z.object({ Items: z.array(storageZoneSchema) }),
  ])
  .transform((value) => (Array.isArray(value) ? value : value.Items))

const pullZonesSchema = z
  .union([
    z.array(pullZoneSchema),
    z.object({ Items: z.array(pullZoneSchema) }),
  ])
  .transform((value) => (Array.isArray(value) ? value : value.Items))

function assertNonProductionResource(field: string, value: string) {
  if (productionMarker.test(value) || !nonProductionMarker.test(value)) {
    throw new Error(`Unsafe Bunny storage contract environment: ${field}`)
  }
}

function contractTtlSeconds(
  source: Record<string, string | undefined>,
  field:
    | 'BUNNY_STORAGE_CONTRACT_EDGE_TTL_SECONDS'
    | 'BUNNY_STORAGE_CONTRACT_BROWSER_TTL_SECONDS',
) {
  const value = source[field]
  if (!value || !/^\d+$/.test(value)) {
    throw new Error(`Unsafe Bunny storage contract environment: ${field}`)
  }
  const seconds = Number(value)
  if (!Number.isSafeInteger(seconds) || seconds <= 0) {
    throw new Error(`Unsafe Bunny storage contract environment: ${field}`)
  }
  return seconds
}

export function assertNonProductionBunnyContract(
  source: Record<string, string | undefined>,
  config: BunnyStorageConfig,
) {
  if (source.BUNNY_STORAGE_CONTRACT_ENVIRONMENT !== 'non-production') {
    throw new Error(
      'Unsafe Bunny storage contract environment: BUNNY_STORAGE_CONTRACT_ENVIRONMENT',
    )
  }
  if (source.BUNNY_STORAGE_CONTRACT_ORIGIN !== BUNNY_CONTRACT_ORIGIN) {
    throw new Error(
      'Unsafe Bunny storage contract environment: BUNNY_STORAGE_CONTRACT_ORIGIN',
    )
  }

  assertNonProductionResource('BUNNY_MEDIA_ZONE', config.media.zone)
  assertNonProductionResource(
    'BUNNY_MEDIA_CDN_URL',
    config.media.cdnBaseUrl.hostname,
  )

  return {
    origin: new URL(BUNNY_CONTRACT_ORIGIN),
    edgeTtlSeconds: contractTtlSeconds(
      source,
      'BUNNY_STORAGE_CONTRACT_EDGE_TTL_SECONDS',
    ),
    browserTtlSeconds: contractTtlSeconds(
      source,
      'BUNNY_STORAGE_CONTRACT_BROWSER_TTL_SECONDS',
    ),
  }
}

function originReferencesStorageZone(origin: string | null | undefined, zone: string) {
  if (!origin) return false
  try {
    const url = new URL(origin)
    return url.pathname.split('/').filter(Boolean).includes(zone)
  } catch {
    return origin.includes(zone)
  }
}

function hasBlockedUrlPath(
  edgeRules: z.infer<typeof edgeRuleSchema>[] | null | undefined,
  path: string,
) {
  return edgeRules?.some((rule) => {
    if (!rule.Enabled || rule.ActionType !== 4) return false
    const triggers = rule.Triggers ?? []
    const pathTrigger = triggers.find((trigger) => {
      if (trigger.Type !== 0 || trigger.PatternMatchingType === 2) return false
      const patterns = trigger.PatternMatches ?? []
      return trigger.PatternMatchingType === 0
        ? patterns.includes(path)
        : trigger.PatternMatchingType === 1 &&
            patterns.length === 1 &&
            patterns[0] === path
    })
    if (!pathTrigger || rule.TriggerMatchingType === 2) return false
    return rule.TriggerMatchingType === 0 ||
      (rule.TriggerMatchingType === 1 && triggers.length === 1)
  }) === true
}

async function requestBunnyJson(
  path: string,
  apiKey: string,
  request: typeof fetch,
) {
  let response: Response
  try {
    response = await request(new URL(path, 'https://api.bunny.net'), {
      headers: { AccessKey: apiKey },
      signal: AbortSignal.timeout(10_000),
    })
  } catch {
    throw new Error('Bunny account contract is unavailable')
  }
  if (!response.ok) {
    throw new Error('Bunny account contract is unavailable')
  }
  try {
    return await response.json()
  } catch {
    throw new Error('Bunny account contract returned an invalid response')
  }
}

export async function verifyBunnyAccountContract(
  config: BunnyStorageConfig,
  expectations: BunnyContractExpectations,
  request: typeof fetch = fetch,
) {
  const [storagePayload, pullPayload] = await Promise.all([
    requestBunnyJson('/storagezone?perPage=1000', config.cdnApiKey, request),
    requestBunnyJson(
      '/pullzone?perPage=1000&includeCertificate=false',
      config.cdnApiKey,
      request,
    ),
  ])
  const storageResult = storageZonesSchema.safeParse(storagePayload)
  const pullResult = pullZonesSchema.safeParse(pullPayload)
  if (!storageResult.success || !pullResult.success) {
    throw new Error('Bunny account contract returned an invalid response')
  }

  const mediaZone = storageResult.data.find(
    (zone) => zone.Name === config.media.zone && !zone.Deleted,
  )
  if (!mediaZone) {
    throw new Error('The Bunny Media Storage Zone does not match the contract')
  }

  const cdnHostname = config.media.cdnBaseUrl.hostname.toLowerCase()
  const mediaPullZone = pullResult.data.find(
    (zone) =>
      (zone.StorageZoneId === mediaZone.Id ||
        originReferencesStorageZone(zone.OriginUrl, config.media.zone)) &&
      zone.Hostnames?.some(
        (hostname) =>
          hostname.Value?.toLowerCase() === cdnHostname &&
          hostname.ForceSSL === true,
      ),
  )
  if (!mediaPullZone) {
    throw new Error('The Media Pull Zone does not match the cache contract')
  }
  const pullZoneDetailResult = pullZoneSchema.safeParse(
    await requestBunnyJson(
      `/pullzone/${mediaPullZone.Id}`,
      config.cdnApiKey,
      request,
    ),
  )
  if (
    !pullZoneDetailResult.success ||
    pullZoneDetailResult.data.Id !== mediaPullZone.Id
  ) {
    throw new Error('Bunny account contract returned an invalid response')
  }
  const mediaPullZoneDetail = pullZoneDetailResult.data
  if (
    !mediaPullZoneDetail.Enabled ||
    mediaPullZoneDetail.Suspended ||
    mediaPullZoneDetail.CacheControlMaxAgeOverride !==
      expectations.edgeTtlSeconds ||
    mediaPullZoneDetail.CacheControlPublicMaxAgeOverride !==
      expectations.browserTtlSeconds
  ) {
    throw new Error('The Media Pull Zone does not match the cache contract')
  }
  if (
    !hasBlockedUrlPath(mediaPullZoneDetail.EdgeRules, '/originals/*') ||
    !hasBlockedUrlPath(
      mediaPullZoneDetail.EdgeRules,
      '/transfer-chunks/*',
    )
  ) {
    throw new Error(
      'The Media Pull Zone does not match the protected path contract',
    )
  }

  return {
    mediaZoneId: mediaZone.Id,
    mediaPullZoneId: mediaPullZone.Id,
  }
}

function cacheControlMaxAge(headers: Headers) {
  const cacheControl = headers.get('cache-control')
  const match = cacheControl?.match(/(?:^|,)\s*max-age=(?:")?(\d+)/i)
  return match ? Number(match[1]) : undefined
}

export function renditionDeliveryHeadersMatchContract(
  headers: Headers,
  browserTtlSeconds: number,
) {
  const maxAge = cacheControlMaxAge(headers)
  const edgeCache = headers.get('cdn-cache')?.toUpperCase()
  const age = Number(headers.get('age'))
  return (
    maxAge !== undefined &&
    maxAge === browserTtlSeconds &&
    (edgeCache === 'HIT' || (Number.isFinite(age) && age > 0))
  )
}
