import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'

import {
  expandOnlyMigrationFindings,
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
  `

  assert.deepEqual(expandOnlyMigrationFindings(sql), [])
})

test('accepts only explicitly reviewed expand operations', () => {
  const sql = `
    CREATE TYPE media_label_source AS ENUM ('owner', 'suggested');
    CREATE SEQUENCE media_label_order_seq;
    CREATE VIEW visible_media_labels AS SELECT id FROM media_labels;
    CREATE FUNCTION visible_media_label_count() RETURNS bigint
      LANGUAGE SQL AS 'SELECT count(*) FROM visible_media_labels';
    ALTER TABLE media_assets ADD COLUMN sort_order bigint NOT NULL DEFAULT 0;
    ALTER TABLE media_assets ADD COLUMN visible boolean NOT NULL DEFAULT true;
    ALTER TABLE media_assets
      ADD COLUMN created_at timestamptz NOT NULL DEFAULT now();
    ALTER TABLE media_assets
      ADD COLUMN public_id uuid NOT NULL DEFAULT gen_random_uuid();
    ALTER TABLE media_assets ALTER COLUMN sort_order SET DEFAULT 1;
    ALTER TABLE media_assets VALIDATE CONSTRAINT media_assets_label_id_fk;
  `

  assert.deepEqual(expandOnlyMigrationFindings(sql), [])
})

test('parses ADD COLUMN IF NOT EXISTS before checking its definition', () => {
  const safe = `
    ALTER TABLE media_assets
      ADD COLUMN IF NOT EXISTS owner_label text;
    ALTER TABLE media_assets
      ADD COLUMN IF NOT EXISTS sort_order bigint NOT NULL DEFAULT 0;
  `
  const unsafe = `
    ALTER TABLE media_assets
      ADD COLUMN IF NOT EXISTS sort_order bigint NOT NULL;
  `

  assert.deepEqual(expandOnlyMigrationFindings(safe), [])
  assert.deepEqual(
    expandOnlyMigrationFindings(unsafe).map(({ operation }) => operation),
    ['ADD COLUMN NOT NULL WITHOUT SAFE DEFAULT'],
  )
})

test('rejects contract-breaking and unrecognized operations', () => {
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
    expandOnlyMigrationFindings(sql).map(({ operation }) => operation),
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

test('rejects unsafe column, constraint, and dynamic SQL forms', () => {
  const sql = `
    ALTER TABLE media_assets ADD COLUMN owner_label text NOT NULL;
    ALTER TABLE media_assets
      ADD CONSTRAINT media_assets_width_check CHECK (width > 0);
    ALTER TABLE media_assets
      ADD CONSTRAINT media_assets_sha_unique UNIQUE (sha256);
    ALTER TABLE media_assets
      ADD CONSTRAINT media_assets_hidden_check CHECK (NOT valid);
    ALTER TABLE media_assets
      ADD CONSTRAINT media_assets_label_fk
      FOREIGN KEY (label_id) REFERENCES media_labels(id) NOT VALID;
    ALTER TABLE media_assets
      ADD CONSTRAINT media_assets_no_writes CHECK (false) NOT VALID;
    ALTER TABLE media_assets
      ADD COLUMN null_owner_label text NOT NULL DEFAULT (NULL);
    ALTER TABLE media_assets
      ADD COLUMN computed_owner_label text NOT NULL
      DEFAULT (NULLIF('x', 'x'));
    ALTER TABLE media_assets
      ADD COLUMN computed_caption text DEFAULT COALESCE(NULL, 'caption');
    ALTER TABLE media_assets ALTER COLUMN sort_order SET DEFAULT NULL;
    CREATE UNIQUE INDEX media_assets_sha_idx ON media_assets (sha256);
    DO $$
    BEGIN
      EXECUTE 'DROP TABLE media_assets';
    END
    $$;
  `

  assert.deepEqual(
    expandOnlyMigrationFindings(sql).map(({ operation }) => operation),
    [
      'ADD COLUMN NOT NULL WITHOUT SAFE DEFAULT',
      'ADD CONSTRAINT REQUIRES REVIEW',
      'ADD CONSTRAINT REQUIRES REVIEW',
      'ADD CONSTRAINT REQUIRES REVIEW',
      'ADD CONSTRAINT REQUIRES REVIEW',
      'ADD CONSTRAINT REQUIRES REVIEW',
      'ADD COLUMN NOT NULL WITHOUT SAFE DEFAULT',
      'ADD COLUMN NOT NULL WITHOUT SAFE DEFAULT',
      'ADD COLUMN REQUIRES SAFE DEFAULT',
      'SET DEFAULT REQUIRES SAFE VALUE',
      'UNRECOGNIZED STATEMENT',
      'UNRECOGNIZED STATEMENT',
    ],
  )
})

test('ignores operation words inside SQL comments and string literals', () => {
  const sql = `
    -- DROP TABLE media_assets;
    /* ALTER TABLE media_assets DROP COLUMN width; */
    CREATE FUNCTION migration_example() RETURNS text
      LANGUAGE SQL AS $$SELECT 'DROP TABLE media_assets'::text$$;
  `

  assert.deepEqual(expandOnlyMigrationFindings(sql), [])
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

test('admits exact reviewed migration baselines without weakening future checks', async () => {
  for (const path of [
    'db/migrations/0011_ama_booking_system.sql',
    'db/migrations/0012_high_fidelity_photo_renditions.sql',
    'db/migrations/0013_brief_yellowjacket.sql',
    'db/migrations/0014_ama_availability_overrides.sql',
    'db/migrations/0015_ama_availability_weekdays.sql',
  ]) {
    const sql = await readFile(path, 'utf8')
    assert.deepEqual(productionMigrationFindings(path, sql), [])
  }
  const path = 'db/migrations/0012_high_fidelity_photo_renditions.sql'
  const sql = await readFile(path, 'utf8')
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

test('preserves the applied legacy migration byte-for-byte', async () => {
  const path = 'db/migrations/0000_shallow_iron_fist.sql'
  const sql = await readFile(path, 'utf8')

  assert.deepEqual(productionMigrationFindings(path, sql), [])
  assert.throws(
    () =>
      productionMigrationFindings(path, `${sql}\n-- changed after review\n`),
    /immutable/,
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
