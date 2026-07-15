import { sql } from 'drizzle-orm'
import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
  uuid,
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

export const mediaUploadIntents = pgTable(
  'media_upload_intents',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    ownerUserId: varchar('owner_user_id', { length: 255 }).notNull(),
    idempotencyKey: varchar('idempotency_key', { length: 128 }).notNull(),
    originalKey: text('original_key').notNull(),
    contentType: varchar('content_type', { length: 64 }).notNull(),
    byteSize: integer('byte_size').notNull(),
    checksumSha256: varchar('checksum_sha256', { length: 64 }).notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('media_upload_intents_owner_idempotency_uidx').on(
      table.ownerUserId,
      table.idempotencyKey,
    ),
    uniqueIndex('media_upload_intents_original_key_uidx').on(table.originalKey),
    index('media_upload_intents_expiry_idx').on(table.expiresAt, table.completedAt),
    check(
      'media_upload_intents_identity_check',
      sql`length(btrim(${table.ownerUserId})) > 0 AND length(btrim(${table.idempotencyKey})) > 0`,
    ),
    check(
      'media_upload_intents_original_key_check',
      sql`length(btrim(${table.originalKey})) > 0`,
    ),
    check(
      'media_upload_intents_content_type_check',
      sql`${table.contentType} IN ('image/jpeg', 'image/png', 'image/heic', 'image/heif')`,
    ),
    check(
      'media_upload_intents_byte_size_check',
      sql`${table.byteSize} BETWEEN 1 AND 52428800`,
    ),
    check(
      'media_upload_intents_checksum_check',
      sql`${table.checksumSha256} ~ '^[0-9a-f]{64}$'`,
    ),
    check(
      'media_upload_intents_expiry_check',
      sql`${table.expiresAt} > ${table.createdAt}`,
    ),
    check(
      'media_upload_intents_completion_check',
      sql`${table.completedAt} IS NULL OR ${table.completedAt} >= ${table.createdAt}`,
    ),
  ],
)

export const mediaAssets = pgTable(
  'media_assets',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    uploadIntentId: uuid('upload_intent_id')
      .notNull()
      .references(() => mediaUploadIntents.id, { onDelete: 'restrict' }),
    kind: varchar('kind', { length: 16 }).default('image').notNull(),
    lifecycle: varchar('lifecycle', { length: 16 })
      .$type<'active' | 'archived' | 'purging'>()
      .default('active')
      .notNull(),
    processingState: varchar('processing_state', { length: 32 })
      .$type<
        | 'upload_initiated'
        | 'original_verified'
        | 'processing'
        | 'ready'
        | 'retryable_failure'
        | 'repair_required'
      >()
      .default('upload_initiated')
      .notNull(),
    processingErrorCode: varchar('processing_error_code', { length: 64 }),
    originalKey: text('original_key').notNull(),
    originalContentType: varchar('original_content_type', { length: 64 }).notNull(),
    originalByteSize: integer('original_byte_size').notNull(),
    originalChecksumSha256: varchar('original_checksum_sha256', {
      length: 64,
    }).notNull(),
    width: integer('width'),
    height: integer('height'),
    capturedAt: timestamp('captured_at', { withTimezone: true }),
    cameraMake: text('camera_make'),
    cameraModel: text('camera_model'),
    lens: text('lens'),
    focalLengthMillimeters: numeric('focal_length_millimeters', {
      precision: 8,
      scale: 3,
    }),
    aperture: numeric('aperture', { precision: 6, scale: 3 }),
    shutterSpeedSeconds: numeric('shutter_speed_seconds', {
      precision: 12,
      scale: 8,
    }),
    iso: integer('iso'),
    focalPointX: numeric('focal_point_x', { precision: 5, scale: 4 }),
    focalPointY: numeric('focal_point_y', { precision: 5, scale: 4 }),
    captureLocationEnvelope: jsonb('capture_location_envelope'),
    locationLabelZhHans: text('location_label_zh_hans'),
    locationLabelEn: text('location_label_en'),
    altTextSuggestionZhHans: text('alt_text_suggestion_zh_hans'),
    altTextSuggestionEn: text('alt_text_suggestion_en'),
    altTextSuggestionModel: varchar('alt_text_suggestion_model', { length: 255 }),
    altTextSuggestedAt: timestamp('alt_text_suggested_at', { withTimezone: true }),
    altTextZhHans: text('alt_text_zh_hans'),
    altTextEn: text('alt_text_en'),
    altTextApprovedAt: timestamp('alt_text_approved_at', { withTimezone: true }),
    archivedAt: timestamp('archived_at', { withTimezone: true }),
    purgeStartedAt: timestamp('purge_started_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('media_assets_upload_intent_uidx').on(table.uploadIntentId),
    uniqueIndex('media_assets_original_key_uidx').on(table.originalKey),
    index('media_assets_library_idx').on(
      table.lifecycle,
      table.processingState,
      table.createdAt,
    ),
    check('media_assets_kind_check', sql`${table.kind} = 'image'`),
    check(
      'media_assets_lifecycle_check',
      sql`${table.lifecycle} IN ('active', 'archived', 'purging')`,
    ),
    check(
      'media_assets_processing_state_check',
      sql`${table.processingState} IN ('upload_initiated', 'original_verified', 'processing', 'ready', 'retryable_failure', 'repair_required')`,
    ),
    check(
      'media_assets_processing_error_check',
      sql`(${table.processingState} IN ('retryable_failure', 'repair_required')) = (${table.processingErrorCode} IS NOT NULL AND length(btrim(${table.processingErrorCode})) > 0)`,
    ),
    check(
      'media_assets_original_key_check',
      sql`length(btrim(${table.originalKey})) > 0`,
    ),
    check(
      'media_assets_original_content_type_check',
      sql`${table.originalContentType} IN ('image/jpeg', 'image/png', 'image/heic', 'image/heif')`,
    ),
    check(
      'media_assets_original_byte_size_check',
      sql`${table.originalByteSize} BETWEEN 1 AND 52428800`,
    ),
    check(
      'media_assets_original_checksum_check',
      sql`${table.originalChecksumSha256} ~ '^[0-9a-f]{64}$'`,
    ),
    check(
      'media_assets_dimensions_check',
      sql`num_nonnulls(${table.width}, ${table.height}) IN (0, 2) AND (${table.width} IS NULL OR (${table.width} > 0 AND ${table.height} > 0 AND (${table.width}::bigint * ${table.height}::bigint) <= 100000000))`,
    ),
    check(
      'media_assets_focal_point_check',
      sql`num_nonnulls(${table.focalPointX}, ${table.focalPointY}) IN (0, 2) AND (${table.focalPointX} IS NULL OR (${table.focalPointX} BETWEEN 0 AND 1 AND ${table.focalPointY} BETWEEN 0 AND 1))`,
    ),
    check(
      'media_assets_camera_values_check',
      sql`(${table.focalLengthMillimeters} IS NULL OR ${table.focalLengthMillimeters} > 0) AND (${table.aperture} IS NULL OR ${table.aperture} > 0) AND (${table.shutterSpeedSeconds} IS NULL OR ${table.shutterSpeedSeconds} > 0) AND (${table.iso} IS NULL OR ${table.iso} > 0)`,
    ),
    check(
      'media_assets_alt_suggestion_check',
      sql`num_nonnulls(${table.altTextSuggestionZhHans}, ${table.altTextSuggestionEn}, ${table.altTextSuggestionModel}, ${table.altTextSuggestedAt}) IN (0, 4) AND (${table.altTextSuggestionZhHans} IS NULL OR (length(btrim(${table.altTextSuggestionZhHans})) > 0 AND length(btrim(${table.altTextSuggestionEn})) > 0 AND length(btrim(${table.altTextSuggestionModel})) > 0))`,
    ),
    check(
      'media_assets_alt_text_check',
      sql`num_nonnulls(${table.altTextZhHans}, ${table.altTextEn}, ${table.altTextApprovedAt}) IN (0, 3) AND (${table.altTextZhHans} IS NULL OR (length(btrim(${table.altTextZhHans})) > 0 AND length(btrim(${table.altTextEn})) > 0))`,
    ),
    check(
      'media_assets_archive_check',
      sql`(${table.lifecycle} = 'active' AND ${table.archivedAt} IS NULL AND ${table.purgeStartedAt} IS NULL) OR (${table.lifecycle} = 'archived' AND ${table.archivedAt} IS NOT NULL AND ${table.purgeStartedAt} IS NULL) OR (${table.lifecycle} = 'purging' AND ${table.archivedAt} IS NOT NULL AND ${table.purgeStartedAt} IS NOT NULL)`,
    ),
  ],
)

export const mediaRenditions = pgTable(
  'media_renditions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    mediaAssetId: uuid('media_asset_id')
      .notNull()
      .references(() => mediaAssets.id, { onDelete: 'restrict' }),
    profileWidth: integer('profile_width').notNull(),
    objectKey: text('object_key').notNull(),
    checksumSha256: varchar('checksum_sha256', { length: 64 }).notNull(),
    byteSize: integer('byte_size').notNull(),
    width: integer('width').notNull(),
    height: integer('height').notNull(),
    contentType: varchar('content_type', { length: 64 }).default('image/jpeg').notNull(),
    colorSpace: varchar('color_space', { length: 16 }).default('srgb').notNull(),
    progressive: boolean('progressive').default(true).notNull(),
    metadataStripped: boolean('metadata_stripped').default(true).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('media_renditions_asset_profile_uidx').on(
      table.mediaAssetId,
      table.profileWidth,
    ),
    uniqueIndex('media_renditions_object_key_uidx').on(table.objectKey),
    check(
      'media_renditions_object_key_check',
      sql`length(btrim(${table.objectKey})) > 0`,
    ),
    check(
      'media_renditions_profile_check',
      sql`${table.profileWidth} IN (640, 1024, 1600)`,
    ),
    check(
      'media_renditions_checksum_check',
      sql`${table.checksumSha256} ~ '^[0-9a-f]{64}$'`,
    ),
    check(
      'media_renditions_dimensions_check',
      sql`${table.width} BETWEEN 1 AND ${table.profileWidth} AND ${table.height} > 0 AND (${table.width}::bigint * ${table.height}::bigint) <= 100000000`,
    ),
    check('media_renditions_byte_size_check', sql`${table.byteSize} > 0`),
    check('media_renditions_content_type_check', sql`${table.contentType} = 'image/jpeg'`),
    check('media_renditions_color_space_check', sql`${table.colorSpace} = 'srgb'`),
    check('media_renditions_progressive_check', sql`${table.progressive} = true`),
    check(
      'media_renditions_metadata_stripped_check',
      sql`${table.metadataStripped} = true`,
    ),
  ],
)
