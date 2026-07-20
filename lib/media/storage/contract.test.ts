import { describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

import {
  assertNonProductionBunnyContract,
  renditionDeliveryHeadersMatchContract,
  verifyBunnyAccountContract,
} from './contract'

const config = {
  region: 'sg' as const,
  media: {
    zone: 'cali-media-preview',
    password: 'media-zone-password',
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

function accountFetch(options?: {
  forceSsl?: boolean
  invalidMatching?: 'rule-match-none' | 'conditional-match-all' | 'pattern-match-none'
  missingProtectedPath?: 'originals' | 'transfer-chunks'
  ttl?: number
}) {
  const ttl = options?.ttl ?? contractExpectations.edgeTtlSeconds
  const pullZone = {
    Id: 404,
    Name: 'media-preview',
    OriginUrl: 'https://storage.bunnycdn.com/cali-media-preview',
    Enabled: true,
    Suspended: false,
    StorageZoneId: 202,
    Hostnames: [
      {
        Value: 'media-preview.cali.so',
        ForceSSL: options?.forceSsl ?? true,
      },
    ],
    CacheControlMaxAgeOverride: ttl,
    CacheControlPublicMaxAgeOverride: ttl,
    EdgeRules: [
      ...(options?.missingProtectedPath === 'originals'
        ? []
        : [
            {
              ActionType: 4,
              TriggerMatchingType:
                options?.invalidMatching === 'rule-match-none'
                  ? 2
                  : options?.invalidMatching === 'conditional-match-all'
                    ? 1
                    : 0,
              Enabled: true,
              Triggers: [
                {
                  Type: 0,
                  PatternMatches: ['/originals/*'],
                  PatternMatchingType:
                    options?.invalidMatching === 'pattern-match-none'
                      ? 2
                      : 0,
                },
                ...(options?.invalidMatching === 'conditional-match-all'
                  ? [
                      {
                        Type: 1,
                        PatternMatches: ['required-header-value'],
                        PatternMatchingType: 0,
                      },
                    ]
                  : []),
              ],
            },
          ]),
      ...(options?.missingProtectedPath === 'transfer-chunks'
        ? []
        : [
            {
              ActionType: 4,
              TriggerMatchingType: 0,
              Enabled: true,
              Triggers: [
                {
                  Type: 0,
                  PatternMatches: ['/transfer-chunks/*'],
                  PatternMatchingType: 0,
                },
              ],
            },
          ]),
    ],
  }
  const { EdgeRules: _edgeRules, ...listedPullZone } = pullZone
  return vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    expect(init?.headers).toEqual({ AccessKey: 'preview-account-api-key' })
    const url = new URL(String(input))
    if (url.pathname === '/storagezone') {
      return Response.json([
        { Id: 202, Name: 'cali-media-preview', Deleted: false },
      ])
    }
    if (url.pathname === '/pullzone') {
      return Response.json({ Items: [listedPullZone] })
    }
    if (url.pathname === '/pullzone/404') {
      return Response.json(pullZone)
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
        media: { ...config.media, zone: 'cali-media-prod' },
      }),
    ).toThrow('BUNNY_MEDIA_ZONE')

    expect(() =>
      assertNonProductionBunnyContract(contractEnvironment, {
        ...config,
        media: {
          ...config.media,
          cdnBaseUrl: new URL('https://media.cali.so'),
        },
      }),
    ).toThrow('BUNNY_MEDIA_CDN_URL')
  })
})

describe('Bunny Media Storage account contract', () => {
  it('verifies the Media zone and Pull Zone cache policy', async () => {
    await expect(
      verifyBunnyAccountContract(config, contractExpectations, accountFetch()),
    ).resolves.toEqual({
        mediaZoneId: 202,
        mediaPullZoneId: 404,
      })
  })

  it('loads the full Pull Zone before verifying protected paths', async () => {
    const request = accountFetch()

    await verifyBunnyAccountContract(config, contractExpectations, request)

    expect(
      request.mock.calls.map(([input]) => new URL(String(input)).pathname),
    ).toContain('/pullzone/404')
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

  it.each(['originals', 'transfer-chunks'] as const)(
    'requires a Block Request rule for /%s/*',
    async (missingProtectedPath) => {
      await expect(
        verifyBunnyAccountContract(
          config,
          contractExpectations,
          accountFetch({ missingProtectedPath }),
        ),
      ).rejects.toThrow('protected path contract')
    },
  )

  it.each([
    'rule-match-none',
    'conditional-match-all',
    'pattern-match-none',
  ] as const)(
    'rejects a protected-path rule with %s semantics',
    async (invalidMatching) => {
      await expect(
        verifyBunnyAccountContract(
          config,
          contractExpectations,
          accountFetch({ invalidMatching }),
        ),
      ).rejects.toThrow('protected path contract')
    },
  )

  it('requires HTTPS enforcement on the public Media hostname', async () => {
    await expect(
      verifyBunnyAccountContract(
        config,
        contractExpectations,
        accountFetch({ forceSsl: false }),
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
