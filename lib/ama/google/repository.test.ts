import { readFile } from 'node:fs/promises'

import { PGlite } from '@electric-sql/pglite'
import { drizzle } from 'drizzle-orm/pglite'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

import { createSecretBox } from '../secrets'
import {
  createAvailabilityRepository,
  type AvailabilityDatabase,
} from '../availability/repository'
import { createGoogleRepository, type GoogleDatabase } from './repository'

const migrations = [
  new URL('../../../db/migrations/0001_ama_owner_auth.sql', import.meta.url),
  new URL('../../../db/migrations/0002_ama_availability.sql', import.meta.url),
  new URL('../../../db/migrations/0003_ama_google_calendar.sql', import.meta.url),
  new URL('../../../db/migrations/0004_ama_google_oauth.sql', import.meta.url),
]

describe('Google Calendar persistence', () => {
  let client: PGlite
  let repository: ReturnType<typeof createGoogleRepository>
  let availability: ReturnType<typeof createAvailabilityRepository>

  beforeEach(async () => {
    client = new PGlite()
    for (const migrationUrl of migrations) {
      const migration = await readFile(migrationUrl, 'utf8')
      await client.exec(migration.replaceAll('--> statement-breakpoint', ''))
    }
    const database = drizzle(client)
    repository = createGoogleRepository(() => database as unknown as GoogleDatabase)
    availability = createAvailabilityRepository(
      () => database as unknown as AvailabilityDatabase,
    )
  })

  afterEach(async () => {
    await client.close()
  })

  it('persists one connected calendar with an encrypted refresh-token envelope', async () => {
    const box = createSecretBox(Buffer.alloc(32, 9).toString('base64'))
    const refreshTokenEnvelope = box.seal('google-refresh-token', 'google-refresh-token')
    const connectedAt = new Date('2026-07-14T06:00:00.000Z')

    await repository.saveConnection({
      status: 'connected',
      calendarId: 'primary',
      calendarEmail: 'owner@example.com',
      calendarSummary: 'Cali Castle',
      grantedScopes: ['calendar.events', 'calendar.freebusy'],
      refreshTokenEnvelope,
      accessTokenExpiresAt: new Date('2026-07-14T07:00:00.000Z'),
      lastErrorCode: null,
      connectedAt,
      updatedAt: connectedAt,
    })

    const connection = await repository.getConnection()

    expect(connection).toMatchObject({
      status: 'connected',
      calendarId: 'primary',
      calendarEmail: 'owner@example.com',
      grantedScopes: ['calendar.events', 'calendar.freebusy'],
      refreshTokenEnvelope,
    })
    expect(JSON.stringify(connection)).not.toContain('google-refresh-token')
  })

  it('stores hashed OAuth state and consumes its encrypted PKCE verifier once', async () => {
    const box = createSecretBox(Buffer.alloc(32, 5).toString('base64'))
    const pkceVerifierEnvelope = box.seal('pkce-verifier-value', 'google-pkce-verifier')
    const now = new Date('2026-07-14T06:00:00.000Z')

    await repository.createOAuthAttempt({
      state: 'raw-oauth-state',
      ownerEmail: 'owner@example.com',
      pkceVerifierEnvelope,
      expiresAt: new Date('2026-07-14T06:10:00.000Z'),
      createdAt: now,
    })

    const stored = await client.query<{
      state_hash: string
      pkce_verifier_envelope: unknown
    }>('select state_hash, pkce_verifier_envelope from ama_google_oauth_attempts')
    expect(stored.rows[0]?.state_hash).toHaveLength(64)
    expect(stored.rows[0]?.state_hash).not.toBe('raw-oauth-state')
    expect(JSON.stringify(stored.rows[0])).not.toContain('pkce-verifier-value')

    const consumed = await Promise.all([
      repository.consumeOAuthAttempt('raw-oauth-state', 'owner@example.com', now),
      repository.consumeOAuthAttempt('raw-oauth-state', 'owner@example.com', now),
    ])
    const accepted = consumed.filter((attempt) => attempt !== null)

    expect(accepted).toHaveLength(1)
    expect(box.open(accepted[0]!.pkceVerifierEnvelope, 'google-pkce-verifier')).toBe(
      'pkce-verifier-value',
    )
  })

  it('does not consume an expired OAuth attempt', async () => {
    const box = createSecretBox(Buffer.alloc(32, 5).toString('base64'))
    await repository.createOAuthAttempt({
      state: 'expired-state',
      ownerEmail: 'owner@example.com',
      pkceVerifierEnvelope: box.seal('expired-verifier', 'google-pkce-verifier'),
      expiresAt: new Date('2026-07-14T06:10:00.000Z'),
      createdAt: new Date('2026-07-14T06:00:00.000Z'),
    })

    await expect(
      repository.consumeOAuthAttempt(
        'expired-state',
        'owner@example.com',
        new Date('2026-07-14T06:10:00.000Z'),
      ),
    ).resolves.toBeNull()
  })

  it('does not consume an OAuth attempt for a different owner', async () => {
    const box = createSecretBox(Buffer.alloc(32, 5).toString('base64'))
    await repository.createOAuthAttempt({
      state: 'owner-bound-state',
      ownerEmail: 'owner@example.com',
      pkceVerifierEnvelope: box.seal('owner-verifier', 'google-pkce-verifier'),
      expiresAt: new Date('2026-07-14T06:10:00.000Z'),
      createdAt: new Date('2026-07-14T06:00:00.000Z'),
    })

    await expect(
      repository.consumeOAuthAttempt(
        'owner-bound-state',
        'other@example.com',
        new Date('2026-07-14T06:05:00.000Z'),
      ),
    ).resolves.toBeNull()
    await expect(
      repository.consumeOAuthAttempt(
        'owner-bound-state',
        'owner@example.com',
        new Date('2026-07-14T06:05:00.000Z'),
      ),
    ).resolves.not.toBeNull()
  })

  it('persists an actionable connection status without replacing its secret', async () => {
    const box = createSecretBox(Buffer.alloc(32, 4).toString('base64'))
    const refreshTokenEnvelope = box.seal('refresh-token', 'google-refresh-token')
    const connectedAt = new Date('2026-07-14T06:00:00.000Z')
    await repository.saveConnection({
      status: 'connected',
      calendarId: 'primary',
      calendarEmail: 'owner@example.com',
      calendarSummary: 'Cali Castle',
      grantedScopes: ['calendar.events', 'calendar.freebusy'],
      refreshTokenEnvelope,
      accessTokenExpiresAt: null,
      lastErrorCode: null,
      connectedAt,
      updatedAt: connectedAt,
    })

    const revoked = await repository.setConnectionStatus(
      'revoked',
      'invalid_grant',
      new Date('2026-07-14T08:00:00.000Z'),
    )

    expect(revoked).toMatchObject({
      status: 'revoked',
      lastErrorCode: 'invalid_grant',
      refreshTokenEnvelope,
    })
  })

  it('records an OAuth failure before a calendar has connected', async () => {
    const denied = await repository.setConnectionStatus(
      'denied_scope',
      'missing_required_scopes',
      new Date('2026-07-14T08:00:00.000Z'),
    )

    expect(denied).toMatchObject({
      id: 1,
      status: 'denied_scope',
      lastErrorCode: 'missing_required_scopes',
      refreshTokenEnvelope: null,
    })
  })

  it('disconnects Google without deleting Availability Windows', async () => {
    const box = createSecretBox(Buffer.alloc(32, 3).toString('base64'))
    const connectedAt = new Date('2026-07-14T06:00:00.000Z')
    await availability.create({ isoWeekday: 2, startMinute: 540, endMinute: 720 })
    await repository.saveConnection({
      status: 'connected',
      calendarId: 'primary',
      calendarEmail: 'owner@example.com',
      calendarSummary: 'Cali Castle',
      grantedScopes: ['calendar.events', 'calendar.freebusy'],
      refreshTokenEnvelope: box.seal('refresh-token', 'google-refresh-token'),
      accessTokenExpiresAt: null,
      lastErrorCode: null,
      connectedAt,
      updatedAt: connectedAt,
    })

    const disconnected = await repository.disconnect(
      new Date('2026-07-14T09:00:00.000Z'),
    )

    expect(disconnected).toMatchObject({
      status: 'disconnected',
      calendarId: null,
      calendarEmail: null,
      grantedScopes: [],
      refreshTokenEnvelope: null,
      lastErrorCode: null,
    })
    expect(await availability.list()).toHaveLength(1)
  })
})
