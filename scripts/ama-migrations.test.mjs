import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const migrationUrl = new URL('../db/migrations/0001_ama_owner_auth.sql', import.meta.url)

test('AMA auth migration only adds its auth tables', async () => {
  const sql = await readFile(migrationUrl, 'utf8')
  const normalized = sql.toLowerCase()

  assert.match(normalized, /create table if not exists "ama_auth_tokens"/)
  assert.match(normalized, /create table if not exists "ama_admin_sessions"/)
  assert.doesNotMatch(normalized, /\b(drop|truncate|alter)\s+table\b/)
  assert.doesNotMatch(normalized, /\b(create|drop|alter|truncate)\s+table[^;]*(subscribers|newsletters)/)
})
