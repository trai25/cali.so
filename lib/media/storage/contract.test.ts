import { describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

import {
  assertNonProductionBunnyContract,
  renditionDeliveryHeadersMatchContract,
  verifyBunnyAccountContract,
} from './contract'

const config = {
  region: 'sg' as const,
  originals: {
    zone: 'cali-media-originals-preview',
    password: 'originals-zone-password',
  },
  renditions: {
    zone: 'cali-media-renditions-preview',
    password: 'renditions-zone-password',
    cdnBaseUrl: new URL('https://media-preview.cali.so/'),
  },
  cdnApiKey: 'preview-account-api-key',
}

const contractEnvironment = {
  BUNNY_STORAGE_CONTRACT_ENVIRONMENT: 'non-production',
  BUNNY_STORAGE_CONTRACT_ORIGIN: 'https://cali.so',
  BUNNY_STORAGE_CONTRACT_EDGE_TTL_SECONDS: '31536000',
  BUNNY_STORAGE_CONTRACT_BROWSER_TTL_SECONDS: '31536000',
}

const contractExpectations = {
  origin: new URL('https://cali.so'),
  edgeTtlSeconds: 31_536_000,
  browserTtlSeconds: 31_536_000,
}

function accountFetch(options?: { originalsPullZone?: boolean; ttl?: number }) {
  const ttl = options?.ttl ?? contractExpectations.edgeTtlSeconds
  return vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    expect(init?.headers).toEqual({ AccessKey: 'preview-account-api-key' })
    const url = new URL(String(input))
    if (url.pathname === '/storagezone') {
      return Response.json([
        { Id: 101, Name: 'cali-media-originals-preview', Deleted: false },
        { Id: 202, Name: 'cali-media-renditions-preview', Deleted: false },
      ])
    }
    if (url.pathname === '/pullzone') {
      return Response.json({
        Items: [
          ...(options?.originalsPullZone
            ? [
                {
                  Id: 303,
                  Name: 'unsafe-originals-preview',
                  OriginUrl:
                    'https://storage.bunnycdn.com/cali-media-originals-preview',
                  Enabled: true,
                  Suspended: false,
                  StorageZoneId: 101,
                  Hostnames: [{ Value: 'originals-preview.cali.so' }],
                  CacheControlMaxAgeOverride: ttl,
                  CacheControlPublicMaxAgeOverride: ttl,
                },
              ]
            : []),
          {
            Id: 404,
            Name: 'media-renditions-preview',
            OriginUrl:
              'https://storage.bunnycdn.com/cali-media-renditions-preview',
            Enabled: true,
            Suspended: false,
            StorageZoneId: 202,
            Hostnames: [{ Value: 'media-preview.cali.so', ForceSSL: true }],
            CacheControlMaxAgeOverride: ttl,
            CacheControlPublicMaxAgeOverride: ttl,
          },
        ],
      })
    }
    return new Response(null, { status: 404 })
  })
}

describe('Bunny Media Storage live contract guards', () => {
  it('accepts only an explicit non-production environment and exact site origin', () => {
    expect(
      assertNonProductionBunnyContract(contractEnvironment, config),
    ).toEqual(contractExpectations)
  })

  it.each([
    [{}, 'BUNNY_STORAGE_CONTRACT_ENVIRONMENT'],
    [
      {
        ...contractEnvironment,
        BUNNY_STORAGE_CONTRACT_ENVIRONMENT: 'production',
      },
      'BUNNY_STORAGE_CONTRACT_ENVIRONMENT',
    ],
    [
      {
        ...contractEnvironment,
        BUNNY_STORAGE_CONTRACT_ORIGIN: 'https://preview.cali.so',
      },
      'BUNNY_STORAGE_CONTRACT_ORIGIN',
    ],
    [
      {
        ...contractEnvironment,
        BUNNY_STORAGE_CONTRACT_EDGE_TTL_SECONDS: '',
      },
      'BUNNY_STORAGE_CONTRACT_EDGE_TTL_SECONDS',
    ],
  ])('rejects unsafe activation through %s', (environment, field) => {
    expect(() =>
      assertNonProductionBunnyContract(environment, config),
    ).toThrow(field)
  })

  it('rejects production-looking remote resources before a live request', () => {
    expect(() =>
      assertNonProductionBunnyContract(contractEnvironment, {
        ...config,
        originals: { ...config.originals, zone: 'cali-media-originals-prod' },
      }),
    ).toThrow('BUNNY_ORIGINALS_ZONE')

    expect(() =>
      assertNonProductionBunnyContract(contractEnvironment, {
        ...config,
        renditions: {
          ...config.renditions,
          cdnBaseUrl: new URL('https://media.cali.so'),
        },
      }),
    ).toThrow('BUNNY_RENDITIONS_CDN_URL')
  })
})

describe('Bunny Media Storage account contract', () => {
  it('verifies Original privacy and the Rendition Pull Zone cache policy', async () => {
    await expect(
      verifyBunnyAccountContract(config, contractExpectations, accountFetch()),
    ).resolves.toEqual({
        originalsZoneId: 101,
        renditionsZoneId: 202,
        renditionsPullZoneId: 404,
      })
  })

  it('rejects an Original Storage Zone attached to a Pull Zone', async () => {
    await expect(
      verifyBunnyAccountContract(
        config,
        contractExpectations,
        accountFetch({ originalsPullZone: true }),
      ),
    ).rejects.toThrow('Original Storage Zone')
  })

  it('rejects an insufficient browser or edge TTL', async () => {
    await expect(
      verifyBunnyAccountContract(
        config,
        contractExpectations,
        accountFetch({ ttl: contractExpectations.edgeTtlSeconds - 1 }),
      ),
    ).rejects.toThrow('cache contract')
  })

  it('requires long-lived browser headers and an observable edge cache hit', () => {
    expect(
      renditionDeliveryHeadersMatchContract(
        new Headers({
          'cache-control': 'public, max-age=31536000',
          'cdn-cache': 'HIT',
        }),
        contractExpectations.browserTtlSeconds,
      ),
    ).toBe(true)
    expect(
      renditionDeliveryHeadersMatchContract(
        new Headers({
          'cache-control': 'public, max-age=3600',
          'cdn-cache': 'HIT',
        }),
        contractExpectations.browserTtlSeconds,
      ),
    ).toBe(false)
    expect(
      renditionDeliveryHeadersMatchContract(
        new Headers({ 'cache-control': 'public, max-age=31536000' }),
        contractExpectations.browserTtlSeconds,
      ),
    ).toBe(false)
  })
})
