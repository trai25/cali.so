import { sql } from 'drizzle-orm'
import {
  check,
  index,
  integer,
  jsonb,
  pgTable,
  serial,
  text,
  timestamp,
  varchar,
} from 'drizzle-orm/pg-core'

import type { EncryptedSecretEnvelope } from '~/lib/ama/secrets'

// These two tables predate v2 and stay mapped exactly as production stores
// them. AMA migrations must never recreate, rename, or drop either table.
export const subscribers = pgTable('subscribers', {
  id: serial('id').primaryKey(),
  email: varchar('email', { length: 120 }),
  token: varchar('token', { length: 50 }),
  subscribedAt: timestamp('subscribed_at'),
  unsubscribedAt: timestamp('unsubscribed_at'),
  updatedAt: timestamp('updated_at').defaultNow(),
})

export const newsletters = pgTable('newsletters', {
  id: serial('id').primaryKey(),
  subject: varchar('subject', { length: 200 }),
  body: text('body'),
  sentAt: timestamp('sent_at'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
})

export const amaAuthTokens = pgTable(
  'ama_auth_tokens',
  {
    tokenHash: varchar('token_hash', { length: 64 }).primaryKey(),
    ownerEmail: varchar('owner_email', { length: 320 }).notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    consumedAt: timestamp('consumed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index('ama_auth_tokens_expires_at_idx').on(table.expiresAt)],
)

export const amaAdminSessions = pgTable(
  'ama_admin_sessions',
  {
    tokenHash: varchar('token_hash', { length: 64 }).primaryKey(),
    ownerEmail: varchar('owner_email', { length: 320 }).notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index('ama_admin_sessions_expires_at_idx').on(table.expiresAt)],
)

export const amaAvailabilityWindows = pgTable(
  'ama_availability_windows',
  {
    id: serial('id').primaryKey(),
    isoWeekday: integer('iso_weekday').notNull(),
    startMinute: integer('start_minute').notNull(),
    endMinute: integer('end_minute').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    check('ama_availability_windows_iso_weekday_check', sql`${table.isoWeekday} BETWEEN 1 AND 7`),
    check('ama_availability_windows_start_minute_check', sql`${table.startMinute} BETWEEN 0 AND 1439`),
    check('ama_availability_windows_end_minute_check', sql`${table.endMinute} BETWEEN 1 AND 1440`),
    check('ama_availability_windows_same_day_check', sql`${table.startMinute} < ${table.endMinute}`),
    index('ama_availability_windows_order_idx').on(
      table.isoWeekday,
      table.startMinute,
      table.endMinute,
    ),
  ],
)

export const amaGoogleCalendarConnections = pgTable(
  'ama_google_calendar_connections',
  {
    id: integer('id').primaryKey().default(1),
    status: varchar('status', { length: 32 })
      .$type<'disconnected' | 'connected' | 'expired' | 'revoked' | 'denied_scope' | 'error'>()
      .notNull(),
    calendarId: varchar('calendar_id', { length: 320 }),
    calendarEmail: varchar('calendar_email', { length: 320 }),
    calendarSummary: text('calendar_summary'),
    grantedScopes: jsonb('granted_scopes').$type<string[]>().default(sql`'[]'::jsonb`).notNull(),
    refreshTokenEnvelope: jsonb('refresh_token_envelope').$type<EncryptedSecretEnvelope>(),
    accessTokenExpiresAt: timestamp('access_token_expires_at', { withTimezone: true }),
    lastErrorCode: varchar('last_error_code', { length: 64 }),
    connectedAt: timestamp('connected_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    check('ama_google_calendar_connections_singleton_check', sql`${table.id} = 1`),
    check(
      'ama_google_calendar_connections_status_check',
      sql`${table.status} IN ('disconnected', 'connected', 'expired', 'revoked', 'denied_scope', 'error')`,
    ),
  ],
)

export const amaGoogleOAuthAttempts = pgTable(
  'ama_google_oauth_attempts',
  {
    stateHash: varchar('state_hash', { length: 64 }).primaryKey(),
    ownerEmail: varchar('owner_email', { length: 320 }).notNull(),
    pkceVerifierEnvelope: jsonb('pkce_verifier_envelope')
      .$type<EncryptedSecretEnvelope>()
      .notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    consumedAt: timestamp('consumed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index('ama_google_oauth_attempts_expires_at_idx').on(table.expiresAt)],
)
