import { describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

import { createAmaSecurity, type SecurityAuditEvent } from '../../ama/security/service'
import { MediaAssetReviewError } from '../asset-review/service'
import { PhotoSelectionError } from '../photo-selection/service'
import {
  createMediaAssetActionHandler,
  createMediaAssetListHandler,
  createMediaUploadIntentHandler,
  createPhotoSelectionDraftHandler,
  createPhotoSelectionPublishHandler,
} from './http'

function request(
  path: string,
  options: {
    authenticated?: boolean
    body?: string
    contentType?: string
    method?: string
    origin?: string
  } = {},
) {
  const {
    authenticated = true,
    body,
    contentType = 'application/json',
    method,
    origin = 'https://cali.so',
  } = options
  return new Request(`https://cali.so${path}`, {
    method: method ?? (body === undefined ? 'GET' : 'POST'),
    headers: {
      ...(authenticated ? { cookie: 'owner=valid' } : {}),
      ...(body === undefined ? {} : { 'content-type': contentType }),
      origin,
      'sec-fetch-site': origin === 'https://cali.so' ? 'same-origin' : 'cross-site',
    },
    body,
  })
}

function fixture(rateLimitAllows = true) {
  const auditEvents: SecurityAuditEvent[] = []
  const calls: unknown[] = []
  const authenticator = {
    async authenticate(value: Request) {
      return value.headers.get('cookie') === 'owner=valid'
        ? { id: 'owner_01' }
        : null
    },
  }
  const security = createAmaSecurity({
    baseUrl: new URL('https://cali.so'),
    features: {
      publicMutations: false,
      payments: false,
      bookingFinalization: false,
      admin: true,
      google: false,
      tencent: false,
    },
    pseudonymKey: Buffer.alloc(32, 7),
    rateLimiter: {
      async limit() {
        return { success: rateLimitAllows }
      },
    },
    audit: {
      write(event) {
        auditEvents.push(event)
      },
    },
    requestId: () => 'media-request-id',
  })
  return { auditEvents, authenticator, calls, security }
}

describe('Media admin HTTP contract', () => {
  it('requires the owner and scopes no-store list reads to that owner', async () => {
    const f = fixture()
    const handler = createMediaAssetListHandler({
      authenticator: f.authenticator,
      security: f.security,
      review: {
        async listAssets(input) {
          f.calls.push(input)
          return [{ id: 'asset_01' }]
        },
      },
    })

    const denied = await handler(
      request('/api/admin/media/assets?view=active', { authenticated: false }),
    )
    const allowed = await handler(request('/api/admin/media/assets?view=archived'))

    expect(denied.status).toBe(401)
    expect(denied.headers.get('cache-control')).toBe('no-store')
    expect(allowed.status).toBe(200)
    expect(allowed.headers.get('cache-control')).toBe('no-store')
    await expect(allowed.json()).resolves.toEqual({ assets: [{ id: 'asset_01' }] })
    expect(f.calls).toEqual([{ ownerUserId: 'owner_01', view: 'archived' }])
    expect(f.auditEvents[0]?.event).toBe('admin_authentication.denied')
  })

  it('rejects invalid list views without calling the review service', async () => {
    const f = fixture()
    const handler = createMediaAssetListHandler({
      authenticator: f.authenticator,
      security: f.security,
      review: {
        async listAssets(input) {
          f.calls.push(input)
          return []
        },
      },
    })

    const response = await handler(request('/api/admin/media/assets?view=all'))

    expect(response.status).toBe(400)
    expect(f.calls).toEqual([])
  })

  it('rejects cross-site and rate-limited mutations before service work', async () => {
    for (const [rateLimitAllows, origin, expectedStatus] of [
      [true, 'https://attacker.example', 403],
      [false, 'https://cali.so', 429],
    ] as const) {
      const f = fixture(rateLimitAllows)
      const handler = createMediaAssetActionHandler({
        authenticator: f.authenticator,
        security: f.security,
        review: {
          async updateDisplayMetadata(input) {
            f.calls.push(input)
            return input
          },
          async approveAltText(input) {
            f.calls.push(input)
            return input
          },
          async archive(input) {
            f.calls.push(input)
            return input
          },
          async restore(input) {
            f.calls.push(input)
            return input
          },
        },
      })

      const response = await handler(
        request('/api/admin/media/assets/asset_01', {
          body: JSON.stringify({ intent: 'archive' }),
          origin,
        }),
        '11111111-1111-4111-8111-111111111111',
      )

      expect(response.status).toBe(expectedStatus)
      expect(response.headers.get('cache-control')).toBe('no-store')
      expect(f.calls).toEqual([])
    }
  })

  it('treats malformed and non-JSON mutation bodies as invalid requests', async () => {
    const f = fixture()
    const handler = createMediaAssetActionHandler({
      authenticator: f.authenticator,
      security: f.security,
      review: {
        async updateDisplayMetadata(input) {
          f.calls.push(input)
          return input
        },
        async approveAltText(input) {
          f.calls.push(input)
          return input
        },
        async archive(input) {
          f.calls.push(input)
          return input
        },
        async restore(input) {
          f.calls.push(input)
          return input
        },
      },
    })

    const malformed = await handler(
      request('/api/admin/media/assets/asset_01', { body: '{' }),
      '11111111-1111-4111-8111-111111111111',
    )
    const wrongType = await handler(
      request('/api/admin/media/assets/asset_01', {
        body: JSON.stringify({ intent: 'archive' }),
        contentType: 'text/plain',
      }),
      '11111111-1111-4111-8111-111111111111',
    )

    expect(malformed.status).toBe(400)
    expect(wrongType.status).toBe(400)
    expect(f.calls).toEqual([])
  })

  it('returns privacy-safe dependency errors without internal messages', async () => {
    const f = fixture()
    const handler = createMediaAssetListHandler({
      authenticator: f.authenticator,
      security: f.security,
      review: {
        async listAssets() {
          throw new Error('postgres password and query details')
        },
      },
    })

    const response = await handler(request('/api/admin/media/assets?view=active'))
    const body = await response.text()

    expect(response.status).toBe(503)
    expect(body).toBe('{"error":"dependency_unavailable"}')
    expect(body).not.toContain('password')
  })

  it('creates typed Upload Intents and records the privileged action', async () => {
    const f = fixture()
    const handler = createMediaUploadIntentHandler({
      authenticator: f.authenticator,
      security: f.security,
      ingestion: {
        async createUploadIntent(input) {
          f.calls.push(input)
          return {
            id: '11111111-1111-4111-8111-111111111111',
            expiresAt: new Date('2026-07-16T12:00:00.000Z'),
          }
        },
      },
    })

    const response = await handler(
      request('/api/admin/media/upload-intents', {
        body: JSON.stringify({
          idempotencyKey: 'upload_01',
          contentType: 'image/heic',
          byteSize: 4096,
          checksumSha256: 'a'.repeat(64),
        }),
      }),
    )

    expect(response.status).toBe(201)
    expect(f.calls).toEqual([
      {
        ownerUserId: 'owner_01',
        idempotencyKey: 'upload_01',
        contentType: 'image/heic',
        byteSize: 4096,
        checksumSha256: 'a'.repeat(64),
      },
    ])
    expect(f.auditEvents.at(-1)?.event).toBe('media_upload.intent_created')
  })

  it('maps known service failures without changing their safe code', async () => {
    const f = fixture()
    const handler = createMediaAssetListHandler({
      authenticator: f.authenticator,
      security: f.security,
      review: {
        async listAssets() {
          throw new MediaAssetReviewError('not_found')
        },
      },
    })

    const response = await handler(request('/api/admin/media/assets?view=active'))

    expect(response.status).toBe(404)
    await expect(response.json()).resolves.toEqual({ error: 'not_found' })
  })

  it('autosaves an owner-scoped Draft and records the revisioned action', async () => {
    const f = fixture()
    const handler = createPhotoSelectionDraftHandler({
      authenticator: f.authenticator,
      security: f.security,
      selection: {
        async saveDraft(input) {
          f.calls.push(input)
          return {
            revision: 4,
            mediaAssetIds: input.mediaAssetIds,
            updatedAt: new Date('2026-07-15T12:00:00.000Z'),
          }
        },
      },
    })
    const mediaAssetIds = ['11111111-1111-4111-8111-111111111111']

    const response = await handler(
      request('/api/admin/media/photo-selection', {
        method: 'PUT',
        body: JSON.stringify({ expectedRevision: 3, mediaAssetIds }),
      }),
    )

    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(f.calls).toEqual([
      { ownerUserId: 'owner_01', expectedRevision: 3, mediaAssetIds },
    ])
    expect(f.auditEvents.at(-1)?.event).toBe(
      'media_photo_selection.draft_saved',
    )
  })

  it('publishes through the owner boundary and preserves safe conflicts', async () => {
    const f = fixture()
    const handler = createPhotoSelectionPublishHandler({
      authenticator: f.authenticator,
      security: f.security,
      selection: {
        async publish(input) {
          f.calls.push(input)
          throw new PhotoSelectionError('ineligible_assets', {
            ineligibleMediaAssetIds: [
              '11111111-1111-4111-8111-111111111111',
            ],
          })
        },
      },
    })

    const response = await handler(
      request('/api/admin/media/photo-selection/publish', {
        body: JSON.stringify({
          expectedDraftRevision: 4,
          idempotencyKey: 'publish_01',
        }),
      }),
    )

    expect(response.status).toBe(409)
    await expect(response.json()).resolves.toEqual({ error: 'ineligible_assets' })
    expect(f.calls).toEqual([
      {
        ownerUserId: 'owner_01',
        expectedDraftRevision: 4,
        idempotencyKey: 'publish_01',
      },
    ])
    expect(f.auditEvents).not.toContainEqual(
      expect.objectContaining({ event: 'media_photo_selection.published' }),
    )
  })

  it('rejects unauthenticated and cross-site Photo Selection writes', async () => {
    const f = fixture()
    const handler = createPhotoSelectionDraftHandler({
      authenticator: f.authenticator,
      security: f.security,
      selection: {
        async saveDraft(input) {
          f.calls.push(input)
          return input
        },
      },
    })
    const body = JSON.stringify({ expectedRevision: 0, mediaAssetIds: [] })

    const unauthenticated = await handler(
      request('/api/admin/media/photo-selection', {
        authenticated: false,
        body,
        method: 'PUT',
      }),
    )
    const crossSite = await handler(
      request('/api/admin/media/photo-selection', {
        body,
        method: 'PUT',
        origin: 'https://attacker.example',
      }),
    )

    expect(unauthenticated.status).toBe(401)
    expect(crossSite.status).toBe(403)
    expect(f.calls).toEqual([])
  })
})
