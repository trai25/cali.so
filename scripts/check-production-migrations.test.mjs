import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'

import {
  destructiveMigrationFindings,
  migrationDiffArguments,
  migrationPathsInRepository,
  parseChangedMigrations,
  productionMigrationFindings,
} from './check-production-migrations.mjs'

test('accepts additive expand migrations', () => {
  const sql = `
    CREATE TABLE media_labels (
      id uuid PRIMARY KEY,
      label text NOT NULL
    );
    ALTER TABLE media_assets ADD COLUMN label_id uuid;
    CREATE INDEX media_assets_label_id_idx ON media_assets (label_id);
    ALTER TABLE media_assets
      ADD CONSTRAINT media_assets_label_id_fk
      FOREIGN KEY (label_id) REFERENCES media_labels(id) NOT VALID;
  `

  assert.deepEqual(destructiveMigrationFindings(sql), [])
})

test('rejects contract-breaking schema and data operations', () => {
  const sql = `
    DROP TABLE old_media;
    ALTER TABLE media_assets DROP COLUMN legacy_caption;
    ALTER TABLE media_assets RENAME COLUMN label TO location_label;
    ALTER TABLE media_assets ALTER COLUMN width TYPE bigint;
    ALTER TABLE media_assets ALTER COLUMN height SET NOT NULL;
    ALTER TABLE media_assets ALTER COLUMN catalog_state DROP DEFAULT;
    TRUNCATE media_upload_intents;
    DELETE FROM media_assets WHERE catalog_state = 'archived';
  `

  assert.deepEqual(
    destructiveMigrationFindings(sql).map(({ operation }) => operation),
    [
      'DROP TABLE',
      'DROP COLUMN',
      'RENAME',
      'ALTER COLUMN TYPE',
      'SET NOT NULL',
      'DROP DEFAULT',
      'TRUNCATE',
      'DELETE',
    ],
  )
})

test('ignores destructive words inside SQL comments and string literals', () => {
  const sql = `
    -- DROP TABLE media_assets;
    /* ALTER TABLE media_assets DROP COLUMN width; */
    INSERT INTO audit_events (event_type, detail)
      VALUES ('DELETE FROM media_assets', $$TRUNCATE media_assets$$);
  `

  assert.deepEqual(destructiveMigrationFindings(sql), [])
})

test('allows only newly added migration files in a Production release', () => {
  assert.deepEqual(
    parseChangedMigrations(
      'A\tdb/migrations/0011_add_media_labels.sql\nA\tdocs/note.md\n',
    ),
    ['db/migrations/0011_add_media_labels.sql'],
  )
  assert.throws(
    () =>
      parseChangedMigrations('M\tdb/migrations/0010_rate_limit_windows.sql\n'),
    /immutable/,
  )
  assert.throws(
    () =>
      parseChangedMigrations('D\tdb/migrations/0009_media_catalog_state.sql\n'),
    /immutable/,
  )
  assert.ok(
    migrationDiffArguments('a'.repeat(40), 'b'.repeat(40)).includes(
      '--diff-filter=ACDMRT',
    ),
  )
})

test('admits the exact reviewed initial migration baseline without weakening future checks', async () => {
  const path = 'db/migrations/0009_media_catalog_state.sql'
  const sql = await readFile(path, 'utf8')
  assert.deepEqual(productionMigrationFindings(path, sql), [])
  assert.throws(
    () =>
      productionMigrationFindings(path, `${sql}\n-- changed after review\n`),
    /immutable/,
  )
  assert.deepEqual(
    productionMigrationFindings(
      'db/migrations/0011_remove_legacy.sql',
      'DROP TABLE legacy;',
    ).map(({ operation }) => operation),
    ['DROP TABLE'],
  )
})

test('checks every migration still present, not only files in the latest push', () => {
  assert.deepEqual(
    migrationPathsInRepository([
      'meta',
      '0011_expand.sql',
      'README.md',
      '0001_baseline.sql',
    ]),
    [
      'db/migrations/0001_baseline.sql',
      'db/migrations/0011_expand.sql',
    ],
  )
})
