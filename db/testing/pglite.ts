import { readFile } from 'node:fs/promises'

import { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, beforeEach } from 'vitest'

const migrationsDir = new URL('../migrations/', import.meta.url)

// One WASM Postgres per test FILE, shared across its tests. Instantiating
// PGlite in beforeEach multiplies concurrent WASM inits across vitest
// workers; under load that init can wedge Node in a permanent microtask
// spin (a fork worker pinned at 100% CPU that no test/hook timeout can
// interrupt, because timers never run while the microtask queue churns).
// Reusing a single instance per file keeps instantiations rare, and each
// test still starts from empty tables via TRUNCATE.
export function usePGliteTestClient(migrationFiles: string[]): () => PGlite {
  let client: PGlite

  // generous timeout: the WASM boot is legitimately slow when several
  // vitest runs compete for the machine — wait instead of failing
  beforeAll(async () => {
    client = new PGlite()
    for (const file of migrationFiles) {
      const migration = await readFile(new URL(file, migrationsDir), 'utf8')
      await client.exec(migration.replaceAll('--> statement-breakpoint', ''))
    }
  }, 120_000)

  beforeEach(async () => {
    const { rows } = await client.query<{ tablename: string }>(
      "select tablename from pg_tables where schemaname = 'public'",
    )
    if (rows.length > 0) {
      const tables = rows.map((row) => `"${row.tablename}"`).join(', ')
      await client.exec(`truncate table ${tables} restart identity cascade`)
    }
  })

  afterAll(async () => {
    await client.close()
  })

  return () => client
}
