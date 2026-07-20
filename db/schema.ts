import { sql } from 'drizzle-orm'
import {
  boolean,
  check,
  customType,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  primaryKey,
  serial,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core'

import type { EncryptedSecretEnvelope } from '~/lib/ama/secrets'

// These two tables predate v3 and stay mapped exactly as production stores
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

export const rateLimitWindows = pgTable(
  'rate_limit_windows',
  {
    scope: varchar('scope', { length: 128 }).notNull(),
    keyHash: varchar('key_hash', { length: 64 }).notNull(),
    requestTimes: timestamp('request_times', { withTimezone: true })
      .array()
      .notNull(),
    windowExpiresAt: timestamp('window_expires_at', {
      withTimezone: true,
    }).notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.scope, table.keyHash] }),
    index('rate_limit_windows_expiry_idx').on(table.windowExpiresAt),
    check(
      'rate_limit_windows_request_times_check',
      sql`cardinality(${table.requestTimes}) > 0`,
    ),
  ],
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

export const amaAvailabilitySettings = pgTable(
  'ama_availability_settings',
  {
    id: integer('id').primaryKey().default(1),
    timeZone: varchar('time_zone', { length: 64 })
      .default('Asia/Taipei')
      .notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    check('ama_availability_settings_singleton_check', sql`${table.id} = 1`),
    check(
      'ama_availability_settings_time_zone_check',
      sql`length(btrim(${table.timeZone})) > 0`,
    ),
  ],
)

export const amaAvailabilityOverrides = pgTable(
  'ama_availability_overrides',
  {
    id: serial('id').primaryKey(),
    localDate: date('local_date', { mode: 'string' }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('ama_availability_overrides_local_date_uidx').on(table.localDate),
  ],
)

export const amaAvailabilityOverrideWindows = pgTable(
  'ama_availability_override_windows',
  {
    id: serial('id').primaryKey(),
    overrideId: integer('override_id')
      .notNull()
      .references(() => amaAvailabilityOverrides.id, { onDelete: 'cascade' }),
    startMinute: integer('start_minute').notNull(),
    endMinute: integer('end_minute').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('ama_availability_override_windows_order_idx').on(
      table.overrideId,
      table.startMinute,
      table.endMinute,
    ),
    check(
      'ama_availability_override_windows_start_minute_check',
      sql`${table.startMinute} BETWEEN 0 AND 1439`,
    ),
    check(
      'ama_availability_override_windows_end_minute_check',
      sql`${table.endMinute} BETWEEN 1 AND 1440`,
    ),
    check(
      'ama_availability_override_windows_same_day_check',
      sql`${table.startMinute} < ${table.endMinute}`,
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
    catalogState: varchar('catalog_state', { length: 16 })
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
      table.catalogState,
      table.processingState,
      table.createdAt,
    ),
    check('media_assets_kind_check', sql`${table.kind} = 'image'`),
    check(
      'media_assets_catalog_state_check',
      sql`${table.catalogState} IN ('active', 'archived', 'purging')`,
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
      sql`(${table.catalogState} = 'active' AND ${table.archivedAt} IS NULL AND ${table.purgeStartedAt} IS NULL) OR (${table.catalogState} = 'archived' AND ${table.archivedAt} IS NOT NULL AND ${table.purgeStartedAt} IS NULL) OR (${table.catalogState} = 'purging' AND ${table.archivedAt} IS NOT NULL AND ${table.purgeStartedAt} IS NOT NULL)`,
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
      sql`${table.profileWidth} IN (640, 1024, 1600, 2560)`,
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

export const mediaAssetPurgeJobs = pgTable(
  'media_asset_purge_jobs',
  {
    // This intentionally remains after the Media Asset row is removed so a
    // retried request can distinguish a completed Purge from an unknown ID.
    mediaAssetId: uuid('media_asset_id').primaryKey(),
    ownerUserId: varchar('owner_user_id', { length: 255 }).notNull(),
    originalKey: text('original_key'),
    startedAt: timestamp('started_at', { withTimezone: true }).notNull(),
    originalDeletedAt: timestamp('original_deleted_at', { withTimezone: true }),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    claimToken: uuid('claim_token'),
    claimExpiresAt: timestamp('claim_expires_at', { withTimezone: true }),
    lastErrorCode: varchar('last_error_code', { length: 64 }),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
  },
  (table) => [
    index('media_asset_purge_jobs_owner_idx').on(
      table.ownerUserId,
      table.completedAt,
      table.updatedAt,
    ),
    check(
      'media_asset_purge_jobs_owner_check',
      sql`length(btrim(${table.ownerUserId})) > 0`,
    ),
    check(
      'media_asset_purge_jobs_claim_check',
      sql`num_nonnulls(${table.claimToken}, ${table.claimExpiresAt}) IN (0, 2)`,
    ),
    check(
      'media_asset_purge_jobs_error_check',
      sql`${table.lastErrorCode} IS NULL OR length(btrim(${table.lastErrorCode})) > 0`,
    ),
    check(
      'media_asset_purge_jobs_completion_check',
      sql`(${table.completedAt} IS NULL AND ${table.originalKey} IS NOT NULL) OR (${table.completedAt} IS NOT NULL AND ${table.originalKey} IS NULL AND ${table.originalDeletedAt} IS NOT NULL AND ${table.claimToken} IS NULL AND ${table.claimExpiresAt} IS NULL AND ${table.lastErrorCode} IS NULL)`,
    ),
  ],
)

export const mediaAssetPurgeRenditions = pgTable(
  'media_asset_purge_renditions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    mediaAssetId: uuid('media_asset_id')
      .notNull()
      .references(() => mediaAssetPurgeJobs.mediaAssetId, {
        onDelete: 'cascade',
      }),
    objectKey: text('object_key').notNull(),
    objectDeletedAt: timestamp('object_deleted_at', { withTimezone: true }),
    cdnPurgedAt: timestamp('cdn_purged_at', { withTimezone: true }),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
  },
  (table) => [
    uniqueIndex('media_asset_purge_renditions_object_uidx').on(
      table.mediaAssetId,
      table.objectKey,
    ),
    check(
      'media_asset_purge_renditions_object_key_check',
      sql`length(btrim(${table.objectKey})) > 0`,
    ),
    check(
      'media_asset_purge_renditions_progress_check',
      sql`${table.cdnPurgedAt} IS NULL OR ${table.objectDeletedAt} IS NOT NULL`,
    ),
  ],
)

export const mediaPhotoSelectionDrafts = pgTable(
  'media_photo_selection_drafts',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    ownerUserId: varchar('owner_user_id', { length: 255 }).notNull(),
    revision: integer('revision').default(0).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('media_photo_selection_drafts_owner_uidx').on(table.ownerUserId),
    check(
      'media_photo_selection_drafts_owner_check',
      sql`length(btrim(${table.ownerUserId})) > 0`,
    ),
    check(
      'media_photo_selection_drafts_revision_check',
      sql`${table.revision} >= 0`,
    ),
  ],
)

export const mediaPhotoSelectionDraftEntries = pgTable(
  'media_photo_selection_draft_entries',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    draftId: uuid('draft_id')
      .notNull()
      .references(() => mediaPhotoSelectionDrafts.id, { onDelete: 'cascade' }),
    mediaAssetId: uuid('media_asset_id')
      .notNull()
      .references(() => mediaAssets.id, { onDelete: 'restrict' }),
    position: integer('position').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('media_photo_selection_draft_entries_asset_uidx').on(
      table.draftId,
      table.mediaAssetId,
    ),
    uniqueIndex('media_photo_selection_draft_entries_position_uidx').on(
      table.draftId,
      table.position,
    ),
    check(
      'media_photo_selection_draft_entries_position_check',
      sql`${table.position} >= 0`,
    ),
  ],
)

export const mediaPublishedPhotoSelections = pgTable(
  'media_published_photo_selections',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    ownerUserId: varchar('owner_user_id', { length: 255 }).notNull(),
    idempotencyKey: varchar('idempotency_key', { length: 128 }).notNull(),
    draftRevision: integer('draft_revision').notNull(),
    itemCount: integer('item_count').notNull(),
    publishedAt: timestamp('published_at', { withTimezone: true }).notNull(),
  },
  (table) => [
    uniqueIndex('media_published_photo_selections_idempotency_uidx').on(
      table.ownerUserId,
      table.idempotencyKey,
    ),
    uniqueIndex('media_published_photo_selections_draft_revision_uidx').on(
      table.ownerUserId,
      table.draftRevision,
    ),
    check(
      'media_published_photo_selections_identity_check',
      sql`length(btrim(${table.ownerUserId})) > 0 AND length(btrim(${table.idempotencyKey})) > 0`,
    ),
    check(
      'media_published_photo_selections_revision_check',
      sql`${table.draftRevision} >= 0`,
    ),
    check(
      'media_published_photo_selections_item_count_check',
      sql`${table.itemCount} >= 0`,
    ),
  ],
)

export const mediaPublishedPhotoSelectionEntries = pgTable(
  'media_published_photo_selection_entries',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    publishedSelectionId: uuid('published_selection_id')
      .notNull()
      .references(() => mediaPublishedPhotoSelections.id, { onDelete: 'cascade' }),
    // Snapshot identity intentionally has no catalog foreign key. Historical
    // publications stay immutable even after a no-longer-active asset is Purged.
    sourceMediaAssetId: uuid('source_media_asset_id').notNull(),
    position: integer('position').notNull(),
    width: integer('width').notNull(),
    height: integer('height').notNull(),
    focalPointX: numeric('focal_point_x', { precision: 5, scale: 4 }),
    focalPointY: numeric('focal_point_y', { precision: 5, scale: 4 }),
    altTextZhHans: text('alt_text_zh_hans').notNull(),
    altTextEn: text('alt_text_en').notNull(),
    locationLabelZhHans: text('location_label_zh_hans'),
    locationLabelEn: text('location_label_en'),
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
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('media_published_photo_selection_entries_asset_uidx').on(
      table.publishedSelectionId,
      table.sourceMediaAssetId,
    ),
    uniqueIndex('media_published_photo_selection_entries_position_uidx').on(
      table.publishedSelectionId,
      table.position,
    ),
    check(
      'media_published_photo_selection_entries_position_check',
      sql`${table.position} >= 0`,
    ),
    check(
      'media_published_photo_selection_entries_dimensions_check',
      sql`${table.width} > 0 AND ${table.height} > 0 AND (${table.width}::bigint * ${table.height}::bigint) <= 100000000`,
    ),
    check(
      'media_published_photo_selection_entries_focal_point_check',
      sql`num_nonnulls(${table.focalPointX}, ${table.focalPointY}) IN (0, 2) AND (${table.focalPointX} IS NULL OR (${table.focalPointX} BETWEEN 0 AND 1 AND ${table.focalPointY} BETWEEN 0 AND 1))`,
    ),
    check(
      'media_published_photo_selection_entries_alt_text_check',
      sql`length(btrim(${table.altTextZhHans})) > 0 AND length(btrim(${table.altTextEn})) > 0`,
    ),
    check(
      'media_published_photo_selection_entries_camera_values_check',
      sql`(${table.focalLengthMillimeters} IS NULL OR ${table.focalLengthMillimeters} > 0) AND (${table.aperture} IS NULL OR ${table.aperture} > 0) AND (${table.shutterSpeedSeconds} IS NULL OR ${table.shutterSpeedSeconds} > 0) AND (${table.iso} IS NULL OR ${table.iso} > 0)`,
    ),
  ],
)

export const mediaPublishedPhotoSelectionRenditions = pgTable(
  'media_published_photo_selection_renditions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    publishedEntryId: uuid('published_entry_id')
      .notNull()
      .references(() => mediaPublishedPhotoSelectionEntries.id, {
        onDelete: 'cascade',
      }),
    profileWidth: integer('profile_width').notNull(),
    objectKey: text('object_key').notNull(),
    width: integer('width').notNull(),
    height: integer('height').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('media_published_photo_selection_renditions_profile_uidx').on(
      table.publishedEntryId,
      table.profileWidth,
    ),
    check(
      'media_published_photo_selection_renditions_profile_check',
      sql`${table.profileWidth} IN (640, 1024, 1600, 2560)`,
    ),
    check(
      'media_published_photo_selection_renditions_object_key_check',
      sql`length(btrim(${table.objectKey})) > 0`,
    ),
    check(
      'media_published_photo_selection_renditions_dimensions_check',
      sql`${table.width} BETWEEN 1 AND ${table.profileWidth} AND ${table.height} > 0 AND (${table.width}::bigint * ${table.height}::bigint) <= 100000000`,
    ),
  ],
)

// The half-open UTC instant range a claim blocks, including the policy
// buffers on both sides. Postgres enforces non-overlap through an exclusion
// constraint that lives in the migration SQL because Drizzle cannot express
// EXCLUDE constraints.
const tstzrange = customType<{ data: string }>({
  dataType() {
    return 'tstzrange'
  },
})

export const amaSlotClaims = pgTable(
  'ama_slot_claims',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    kind: varchar('kind', { length: 16 }).$type<'hold' | 'booking'>().notNull(),
    status: varchar('status', { length: 16 })
      .$type<'active' | 'released'>()
      .default('active')
      .notNull(),
    startsAt: timestamp('starts_at', { withTimezone: true }).notNull(),
    endsAt: timestamp('ends_at', { withTimezone: true }).notNull(),
    blockedDuring: tstzrange('blocked_during').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    releasedAt: timestamp('released_at', { withTimezone: true }),
    releaseReason: varchar('release_reason', { length: 32 }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('ama_slot_claims_active_idx').on(table.status, table.endsAt),
    index('ama_slot_claims_expiry_idx').on(table.status, table.expiresAt),
    check('ama_slot_claims_kind_check', sql`${table.kind} IN ('hold', 'booking')`),
    check('ama_slot_claims_status_check', sql`${table.status} IN ('active', 'released')`),
    check('ama_slot_claims_interval_check', sql`${table.startsAt} < ${table.endsAt}`),
    check(
      'ama_slot_claims_blocked_during_check',
      sql`${table.blockedDuring} = tstzrange(${table.startsAt} - interval '15 minutes', ${table.endsAt} + interval '15 minutes', '[)')`,
    ),
    check(
      'ama_slot_claims_hold_expiry_check',
      sql`(${table.kind} = 'hold') = (${table.expiresAt} IS NOT NULL)`,
    ),
    check(
      'ama_slot_claims_release_check',
      sql`(${table.status} = 'active' AND ${table.releasedAt} IS NULL AND ${table.releaseReason} IS NULL) OR (${table.status} = 'released' AND ${table.releasedAt} IS NOT NULL AND ${table.releaseReason} IS NOT NULL)`,
    ),
  ],
)

export const amaBookingIntents = pgTable(
  'ama_booking_intents',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    holdClaimId: uuid('hold_claim_id')
      .notNull()
      .references(() => amaSlotClaims.id, { onDelete: 'restrict' }),
    guestName: varchar('guest_name', { length: 120 }).notNull(),
    guestEmail: varchar('guest_email', { length: 320 }).notNull(),
    locale: varchar('locale', { length: 2 }).$type<'zh' | 'en'>().notNull(),
    guestTimeZone: varchar('guest_time_zone', { length: 64 }).notNull(),
    topics: jsonb('topics').$type<string[]>().notNull(),
    briefText: text('brief_text').notNull(),
    briefUrls: jsonb('brief_urls').$type<string[]>().default(sql`'[]'::jsonb`).notNull(),
    meetingProvider: varchar('meeting_provider', { length: 20 })
      .$type<'google-meet' | 'tencent-meeting'>()
      .notNull(),
    stripeCheckoutSessionId: varchar('stripe_checkout_session_id', { length: 255 }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('ama_booking_intents_hold_claim_uidx').on(table.holdClaimId),
    uniqueIndex('ama_booking_intents_checkout_session_uidx').on(
      table.stripeCheckoutSessionId,
    ),
    check(
      'ama_booking_intents_guest_check',
      sql`length(btrim(${table.guestName})) > 0 AND length(btrim(${table.guestEmail})) > 0`,
    ),
    check('ama_booking_intents_locale_check', sql`${table.locale} IN ('zh', 'en')`),
    check(
      'ama_booking_intents_time_zone_check',
      sql`length(btrim(${table.guestTimeZone})) > 0`,
    ),
    check(
      'ama_booking_intents_topics_check',
      sql`jsonb_typeof(${table.topics}) = 'array' AND jsonb_array_length(${table.topics}) BETWEEN 1 AND 8`,
    ),
    check(
      'ama_booking_intents_brief_check',
      sql`length(btrim(${table.briefText})) > 0 AND char_length(${table.briefText}) <= 2000`,
    ),
    check(
      'ama_booking_intents_brief_urls_check',
      sql`jsonb_typeof(${table.briefUrls}) = 'array' AND jsonb_array_length(${table.briefUrls}) <= 5`,
    ),
    check(
      'ama_booking_intents_provider_check',
      sql`${table.meetingProvider} IN ('google-meet', 'tencent-meeting')`,
    ),
  ],
)

export const amaBookings = pgTable(
  'ama_bookings',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    intentId: uuid('intent_id')
      .notNull()
      .references(() => amaBookingIntents.id, { onDelete: 'restrict' }),
    claimId: uuid('claim_id').references(() => amaSlotClaims.id, {
      onDelete: 'restrict',
    }),
    status: varchar('status', { length: 20 })
      .$type<'finalizing' | 'confirmed' | 'needs_reschedule' | 'cancelled'>()
      .default('finalizing')
      .notNull(),
    guestName: varchar('guest_name', { length: 120 }).notNull(),
    guestEmail: varchar('guest_email', { length: 320 }).notNull(),
    locale: varchar('locale', { length: 2 }).$type<'zh' | 'en'>().notNull(),
    guestTimeZone: varchar('guest_time_zone', { length: 64 }).notNull(),
    topics: jsonb('topics').$type<string[]>().notNull(),
    briefText: text('brief_text'),
    briefUrls: jsonb('brief_urls').$type<string[]>(),
    briefPurgedAt: timestamp('brief_purged_at', { withTimezone: true }),
    meetingProvider: varchar('meeting_provider', { length: 20 })
      .$type<'google-meet' | 'tencent-meeting'>()
      .notNull(),
    startsAt: timestamp('starts_at', { withTimezone: true }).notNull(),
    endsAt: timestamp('ends_at', { withTimezone: true }).notNull(),
    stripeCheckoutSessionId: varchar('stripe_checkout_session_id', {
      length: 255,
    }).notNull(),
    stripePaymentIntentId: varchar('stripe_payment_intent_id', { length: 255 }),
    amountTotal: integer('amount_total').notNull(),
    currency: varchar('currency', { length: 8 }).notNull(),
    refundStatus: varchar('refund_status', { length: 16 })
      .$type<'none' | 'pending' | 'refunded' | 'failed'>()
      .default('none')
      .notNull(),
    stripeRefundId: varchar('stripe_refund_id', { length: 255 }),
    refundedAt: timestamp('refunded_at', { withTimezone: true }),
    refundReason: varchar('refund_reason', { length: 32 }),
    cancelledAt: timestamp('cancelled_at', { withTimezone: true }),
    cancelledBy: varchar('cancelled_by', { length: 16 }).$type<'guest' | 'owner'>(),
    meetingUrl: text('meeting_url'),
    googleCalendarEventId: varchar('google_calendar_event_id', { length: 255 }),
    tencentMeetingId: varchar('tencent_meeting_id', { length: 255 }),
    meetingCreatedAt: timestamp('meeting_created_at', { withTimezone: true }),
    manageTokenHash: varchar('manage_token_hash', { length: 64 }),
    manageTokenIssuedAt: timestamp('manage_token_issued_at', { withTimezone: true }),
    manageTokenRevokedAt: timestamp('manage_token_revoked_at', {
      withTimezone: true,
    }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('ama_bookings_intent_uidx').on(table.intentId),
    uniqueIndex('ama_bookings_checkout_session_uidx').on(
      table.stripeCheckoutSessionId,
    ),
    uniqueIndex('ama_bookings_manage_token_uidx').on(table.manageTokenHash),
    index('ama_bookings_schedule_idx').on(table.status, table.startsAt),
    index('ama_bookings_claim_idx').on(table.claimId),
    check(
      'ama_bookings_status_check',
      sql`${table.status} IN ('finalizing', 'confirmed', 'needs_reschedule', 'cancelled')`,
    ),
    check('ama_bookings_locale_check', sql`${table.locale} IN ('zh', 'en')`),
    check(
      'ama_bookings_provider_check',
      sql`${table.meetingProvider} IN ('google-meet', 'tencent-meeting')`,
    ),
    check('ama_bookings_interval_check', sql`${table.startsAt} < ${table.endsAt}`),
    check(
      'ama_bookings_claim_presence_check',
      sql`${table.status} IN ('needs_reschedule', 'cancelled') OR ${table.claimId} IS NOT NULL`,
    ),
    check(
      'ama_bookings_refund_status_check',
      sql`${table.refundStatus} IN ('none', 'pending', 'refunded', 'failed')`,
    ),
    check(
      'ama_bookings_refund_reason_check',
      sql`${table.refundReason} IS NULL OR ${table.refundReason} IN ('guest_cancellation', 'owner_cancellation', 'owner_exception')`,
    ),
    check(
      'ama_bookings_cancellation_check',
      sql`(${table.status} = 'cancelled') = (${table.cancelledAt} IS NOT NULL AND ${table.cancelledBy} IS NOT NULL)`,
    ),
    check(
      'ama_bookings_cancelled_by_check',
      sql`${table.cancelledBy} IS NULL OR ${table.cancelledBy} IN ('guest', 'owner')`,
    ),
    check(
      'ama_bookings_brief_purge_check',
      sql`(${table.briefPurgedAt} IS NULL AND ${table.briefText} IS NOT NULL AND ${table.briefUrls} IS NOT NULL) OR (${table.briefPurgedAt} IS NOT NULL AND ${table.briefText} IS NULL AND ${table.briefUrls} IS NULL)`,
    ),
    check(
      'ama_bookings_manage_token_check',
      sql`(${table.manageTokenHash} IS NULL) = (${table.manageTokenIssuedAt} IS NULL)`,
    ),
    check('ama_bookings_amount_check', sql`${table.amountTotal} > 0`),
  ],
)

export const amaBookingEvents = pgTable(
  'ama_booking_events',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    bookingId: uuid('booking_id')
      .notNull()
      .references(() => amaBookings.id, { onDelete: 'restrict' }),
    event: varchar('event', { length: 48 }).notNull(),
    actor: varchar('actor', { length: 16 })
      .$type<'guest' | 'owner' | 'system' | 'provider'>()
      .notNull(),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull(),
    detail: jsonb('detail').default(sql`'{}'::jsonb`).notNull(),
  },
  (table) => [
    index('ama_booking_events_booking_idx').on(table.bookingId, table.occurredAt),
    check('ama_booking_events_event_check', sql`length(btrim(${table.event})) > 0`),
    check(
      'ama_booking_events_actor_check',
      sql`${table.actor} IN ('guest', 'owner', 'system', 'provider')`,
    ),
  ],
)

export const amaProviderEvents = pgTable(
  'ama_provider_events',
  {
    provider: varchar('provider', { length: 16 }).notNull(),
    eventId: varchar('event_id', { length: 255 }).notNull(),
    eventType: varchar('event_type', { length: 64 }).notNull(),
    receivedAt: timestamp('received_at', { withTimezone: true }).notNull(),
    processedAt: timestamp('processed_at', { withTimezone: true }),
    outcome: varchar('outcome', { length: 32 }),
  },
  (table) => [
    primaryKey({ columns: [table.provider, table.eventId] }),
    check('ama_provider_events_provider_check', sql`${table.provider} = 'stripe'`),
    check(
      'ama_provider_events_identity_check',
      sql`length(btrim(${table.eventId})) > 0 AND length(btrim(${table.eventType})) > 0`,
    ),
  ],
)

export const amaDurableOperations = pgTable(
  'ama_durable_operations',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    kind: varchar('kind', { length: 48 }).notNull(),
    dedupeKey: varchar('dedupe_key', { length: 255 }).notNull(),
    bookingId: uuid('booking_id').references(() => amaBookings.id, {
      onDelete: 'restrict',
    }),
    payload: jsonb('payload').default(sql`'{}'::jsonb`).notNull(),
    status: varchar('status', { length: 16 })
      .$type<'pending' | 'running' | 'succeeded' | 'failed' | 'cancelled' | 'resolved'>()
      .default('pending')
      .notNull(),
    attemptCount: integer('attempt_count').default(0).notNull(),
    maxAttempts: integer('max_attempts').default(8).notNull(),
    nextAttemptAt: timestamp('next_attempt_at', { withTimezone: true }).notNull(),
    leaseToken: uuid('lease_token'),
    leaseExpiresAt: timestamp('lease_expires_at', { withTimezone: true }),
    lastErrorCode: varchar('last_error_code', { length: 64 }),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('ama_durable_operations_dedupe_uidx').on(table.dedupeKey),
    index('ama_durable_operations_due_idx').on(table.status, table.nextAttemptAt),
    index('ama_durable_operations_booking_idx').on(table.bookingId),
    check('ama_durable_operations_kind_check', sql`length(btrim(${table.kind})) > 0`),
    check(
      'ama_durable_operations_status_check',
      sql`${table.status} IN ('pending', 'running', 'succeeded', 'failed', 'cancelled', 'resolved')`,
    ),
    check(
      'ama_durable_operations_attempts_check',
      sql`${table.attemptCount} >= 0 AND ${table.maxAttempts} > 0`,
    ),
    check(
      'ama_durable_operations_lease_check',
      sql`num_nonnulls(${table.leaseToken}, ${table.leaseExpiresAt}) IN (0, 2)`,
    ),
    check(
      'ama_durable_operations_completion_check',
      sql`(${table.status} IN ('succeeded', 'failed', 'cancelled', 'resolved')) = (${table.completedAt} IS NOT NULL)`,
    ),
  ],
)

export const amaAlternateTimeRequests = pgTable(
  'ama_alternate_time_requests',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    guestName: varchar('guest_name', { length: 120 }).notNull(),
    guestEmail: varchar('guest_email', { length: 320 }).notNull(),
    locale: varchar('locale', { length: 2 }).$type<'zh' | 'en'>().notNull(),
    guestTimeZone: varchar('guest_time_zone', { length: 64 }).notNull(),
    preferredWindows: text('preferred_windows').notNull(),
    note: text('note'),
    status: varchar('status', { length: 16 })
      .$type<'new' | 'resolved' | 'dismissed'>()
      .default('new')
      .notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    resolvedAt: timestamp('resolved_at', { withTimezone: true }),
  },
  (table) => [
    index('ama_alternate_time_requests_status_idx').on(table.status, table.createdAt),
    check(
      'ama_alternate_time_requests_guest_check',
      sql`length(btrim(${table.guestName})) > 0 AND length(btrim(${table.guestEmail})) > 0`,
    ),
    check(
      'ama_alternate_time_requests_locale_check',
      sql`${table.locale} IN ('zh', 'en')`,
    ),
    check(
      'ama_alternate_time_requests_windows_check',
      sql`length(btrim(${table.preferredWindows})) > 0 AND char_length(${table.preferredWindows}) <= 1000`,
    ),
    check(
      'ama_alternate_time_requests_note_check',
      sql`${table.note} IS NULL OR char_length(${table.note}) <= 1000`,
    ),
    check(
      'ama_alternate_time_requests_status_check',
      sql`${table.status} IN ('new', 'resolved', 'dismissed')`,
    ),
    check(
      'ama_alternate_time_requests_resolution_check',
      sql`(${table.status} = 'new') = (${table.resolvedAt} IS NULL)`,
    ),
  ],
)

export const mediaActivePhotoPublication = pgTable(
  'media_active_photo_publication',
  {
    id: integer('id').primaryKey().default(1),
    publishedSelectionId: uuid('published_selection_id')
      .notNull()
      .references(() => mediaPublishedPhotoSelections.id, { onDelete: 'restrict' }),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('media_active_photo_publication_selection_uidx').on(
      table.publishedSelectionId,
    ),
    check('media_active_photo_publication_singleton_check', sql`${table.id} = 1`),
  ],
)
