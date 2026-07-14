import { index, pgTable, serial, text, timestamp, varchar } from 'drizzle-orm/pg-core'

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
