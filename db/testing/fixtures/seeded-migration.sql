-- Fixture for db/testing/pglite.test.ts: a migration that creates both a
-- reference table it seeds itself and a plain table it leaves empty.
CREATE TABLE seeded_lookup (
  id integer PRIMARY KEY,
  label text NOT NULL
);
--> statement-breakpoint
INSERT INTO seeded_lookup (id, label) VALUES (1, 'alpha'), (2, 'beta');
--> statement-breakpoint
CREATE TABLE plain (
  id serial PRIMARY KEY,
  note text NOT NULL
);
