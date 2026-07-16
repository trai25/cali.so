import { readFile } from 'node:fs/promises'

import { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, beforeEach } from 'vitest'

const migrationsDir = new URL('../migrations/', import.meta.url)
const SEED_SCHEMA = '_migration_seed'

// One WASM Postgres per test FILE, shared across its tests. Instantiating
// PGlite in beforeEach multiplies concurrent WASM inits across vitest
// workers; under load that init can wedge Node in a permanent microtask
// spin (a fork worker pinned at 100% CPU that no test/hook timeout can
// interrupt, because timers never run while the microtask queue churns).
// Reusing a single instance per file keeps instantiations rare, and each
// test still starts from post-migration state: tables are truncated, and
// any rows the migrations themselves seeded (captured at boot into a
// shadow schema) are restored.
export function usePGliteTestClient(migrationFiles: string[]): () => PGlite {
  let client: PGlite | undefined
  let seededTables: string[] = []

  // generous timeout: the WASM boot is legitimately slow when several
  // vitest runs compete for the machine — wait instead of failing
  beforeAll(async () => {
    const booted = new PGlite()
    for (const file of migrationFiles) {
      const migration = await readFile(new URL(file, migrationsDir), 'utf8')
      await booted.exec(migration.replaceAll('--> statement-breakpoint', ''))
    }

    const { rows } = await booted.query<{ tablename: string }>(
      "select tablename from pg_tables where schemaname = 'public'",
    )
    seededTables = []
    await booted.exec(`create schema if not exists "${SEED_SCHEMA}"`)
    for (const { tablename } of rows) {
      const count = await booted.query<{ n: number }>(
        `select count(*)::int as n from public."${tablename}"`,
      )
      if (count.rows[0]!.n === 0) continue
      await booted.exec(
        `create table "${SEED_SCHEMA}"."${tablename}" as table public."${tablename}"`,
      )
      seededTables.push(tablename)
    }

    client = booted
  }, 120_000)

  beforeEach(async () => {
    const db = requireClient(client)
    const { rows } = await db.query<{ tablename: string }>(
      "select tablename from pg_tables where schemaname = 'public'",
    )
    if (rows.length > 0) {
      const tables = rows.map((row) => `"${row.tablename}"`).join(', ')
      await db.exec(`truncate table ${tables} restart identity cascade`)
    }
    for (const tablename of seededTables) {
      await db.exec(
        `insert into public."${tablename}" select * from "${SEED_SCHEMA}"."${tablename}"`,
      )
    }
  })

  afterAll(async () => {
    // a failed boot leaves no client; closing nothing must not mask the
    // original beforeAll error with a TypeError
    await client?.close()
  })

  return () => requireClient(client)
}

function requireClient(client: PGlite | undefined): PGlite {
  if (!client) {
    throw new Error('PGlite test client used before beforeAll booted it')
  }
  return client
}
