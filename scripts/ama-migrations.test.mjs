import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const migrationUrls = {
  auth: new URL('../db/migrations/0001_ama_owner_auth.sql', import.meta.url),
  availability: new URL('../db/migrations/0002_ama_availability.sql', import.meta.url),
  googleCalendar: new URL('../db/migrations/0003_ama_google_calendar.sql', import.meta.url),
  googleOAuth: new URL('../db/migrations/0004_ama_google_oauth.sql', import.meta.url),
  rateLimits: new URL('../db/migrations/0010_rate_limit_windows.sql', import.meta.url),
}

async function readMigration(url) {
  return (await readFile(url, 'utf8')).toLowerCase()
}

test('AMA auth migration only adds its auth tables', async () => {
  const normalized = await readMigration(migrationUrls.auth)

  assert.match(normalized, /create table if not exists "ama_auth_tokens"/)
  assert.match(normalized, /create table if not exists "ama_admin_sessions"/)
  assert.doesNotMatch(normalized, /\b(drop|truncate|alter)\s+table\b/)
  assert.doesNotMatch(normalized, /\b(create|drop|alter|truncate)\s+table[^;]*(subscribers|newsletters)/)
})

test('AMA Availability Window migration enforces same-day ISO weekday bounds', async () => {
  const sql = await readMigration(migrationUrls.availability)

  assert.match(sql, /create table "ama_availability_windows"/)
  assert.match(sql, /"iso_weekday" between 1 and 7/)
  assert.match(sql, /"start_minute" between 0 and 1439/)
  assert.match(sql, /"end_minute" between 1 and 1440/)
  assert.match(sql, /"start_minute" < "ama_availability_windows"\."end_minute"/)
  assert.match(sql, /create index "ama_availability_windows_order_idx"/)
})

test('AMA Google Calendar migration creates a constrained singleton connection', async () => {
  const sql = await readMigration(migrationUrls.googleCalendar)

  assert.match(sql, /create table "ama_google_calendar_connections"/)
  assert.match(sql, /"id" = 1/)
  assert.match(
    sql,
    /"status" in \('disconnected', 'connected', 'expired', 'revoked', 'denied_scope', 'error'\)/,
  )
  assert.match(sql, /"refresh_token_envelope" jsonb/)
  assert.match(sql, /"granted_scopes" jsonb/)
})

test('AMA Google OAuth migration stores hashed state and encrypted PKCE material', async () => {
  const sql = await readMigration(migrationUrls.googleOAuth)

  assert.match(sql, /create table "ama_google_oauth_attempts"/)
  assert.match(sql, /"state_hash" varchar\(64\) primary key/)
  assert.match(sql, /"pkce_verifier_envelope" jsonb not null/)
  assert.match(sql, /"expires_at" timestamp with time zone not null/)
  assert.match(sql, /"consumed_at" timestamp with time zone/)
  assert.doesNotMatch(sql, /"state"\s/)
  assert.doesNotMatch(sql, /"pkce_verifier"\s/)
})

test('rate-limit migration stores bounded windows without private request keys', async () => {
  const sql = await readMigration(migrationUrls.rateLimits)

  assert.match(sql, /create table "rate_limit_windows"/)
  assert.match(sql, /primary key\("scope","key_hash"\)/)
  assert.match(sql, /"request_count" > 0/)
  assert.match(sql, /create index "rate_limit_windows_expiry_idx"/)
  assert.doesNotMatch(sql, /"request_key"/)
})

test('AMA migrations never mutate legacy subscriber or newsletter tables', async () => {
  const sql = (
    await Promise.all(Object.values(migrationUrls).map(readMigration))
  ).join('\n')

  assert.doesNotMatch(sql, /\b(drop|truncate|alter)\s+table\b/)
  assert.doesNotMatch(
    sql,
    /\b(create|drop|alter|truncate)\s+table[^;]*(subscribers|newsletters)/,
  )
  assert.doesNotMatch(
    sql,
    /\b(insert\s+into|update|delete\s+from)\s+[^;]*(subscribers|newsletters)/,
  )
})
