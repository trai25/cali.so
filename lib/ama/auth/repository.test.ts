import { readFile } from 'node:fs/promises'

import { PGlite } from '@electric-sql/pglite'
import { drizzle } from 'drizzle-orm/pglite'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

import { createAuthRepository, type AuthDatabase } from './repository'

const migrationUrl = new URL('../../../db/migrations/0001_ama_owner_auth.sql', import.meta.url)

describe('owner authentication repository', () => {
  let client: PGlite
  let repository: ReturnType<typeof createAuthRepository>

  beforeEach(async () => {
    client = new PGlite()
    const migration = await readFile(migrationUrl, 'utf8')
    await client.exec(migration.replaceAll('--> statement-breakpoint', ''))
    const database = drizzle(client)
    repository = createAuthRepository(() => database as unknown as AuthDatabase)
  })

  afterEach(async () => {
    await client.close()
  })

  it('allows exactly one concurrent consume for the current owner', async () => {
    const now = new Date('2026-07-14T04:00:00.000Z')
    await repository.createLoginToken({
      tokenHash: 'a'.repeat(64),
      email: 'owner@example.com',
      expiresAt: new Date('2026-07-14T04:15:00.000Z'),
      consumedAt: null,
      createdAt: now,
    })

    const results = await Promise.all([
      repository.consumeLoginToken('a'.repeat(64), 'owner@example.com', now),
      repository.consumeLoginToken('a'.repeat(64), 'owner@example.com', now),
    ])

    expect(results.sort()).toEqual([false, true])
  })

  it('does not consume a token issued to a previous owner', async () => {
    const now = new Date('2026-07-14T04:00:00.000Z')
    await repository.createLoginToken({
      tokenHash: 'b'.repeat(64),
      email: 'old-owner@example.com',
      expiresAt: new Date('2026-07-14T04:15:00.000Z'),
      consumedAt: null,
      createdAt: now,
    })

    await expect(
      repository.consumeLoginToken('b'.repeat(64), 'new-owner@example.com', now),
    ).resolves.toBe(false)
  })
})
