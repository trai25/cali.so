CREATE TABLE "media_assets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"upload_intent_id" uuid NOT NULL,
	"kind" varchar(16) DEFAULT 'image' NOT NULL,
	"lifecycle" varchar(16) DEFAULT 'active' NOT NULL,
	"processing_state" varchar(32) DEFAULT 'upload_initiated' NOT NULL,
	"processing_error_code" varchar(64),
	"original_key" text NOT NULL,
	"original_content_type" varchar(64) NOT NULL,
	"original_byte_size" integer NOT NULL,
	"original_checksum_sha256" varchar(64) NOT NULL,
	"width" integer,
	"height" integer,
	"captured_at" timestamp with time zone,
	"camera_make" text,
	"camera_model" text,
	"lens" text,
	"focal_length_millimeters" numeric(8, 3),
	"aperture" numeric(6, 3),
	"shutter_speed_seconds" numeric(12, 8),
	"iso" integer,
	"focal_point_x" numeric(5, 4),
	"focal_point_y" numeric(5, 4),
	"capture_location_envelope" jsonb,
	"location_label_zh_hans" text,
	"location_label_en" text,
	"alt_text_suggestion_zh_hans" text,
	"alt_text_suggestion_en" text,
	"alt_text_suggestion_model" varchar(255),
	"alt_text_suggested_at" timestamp with time zone,
	"alt_text_zh_hans" text,
	"alt_text_en" text,
	"alt_text_approved_at" timestamp with time zone,
	"archived_at" timestamp with time zone,
	"purge_started_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "media_assets_kind_check" CHECK ("media_assets"."kind" = 'image'),
	CONSTRAINT "media_assets_lifecycle_check" CHECK ("media_assets"."lifecycle" IN ('active', 'archived', 'purging')),
	CONSTRAINT "media_assets_processing_state_check" CHECK ("media_assets"."processing_state" IN ('upload_initiated', 'original_verified', 'processing', 'ready', 'retryable_failure', 'repair_required')),
	CONSTRAINT "media_assets_processing_error_check" CHECK (("media_assets"."processing_state" IN ('retryable_failure', 'repair_required')) = ("media_assets"."processing_error_code" IS NOT NULL AND length(btrim("media_assets"."processing_error_code")) > 0)),
	CONSTRAINT "media_assets_original_key_check" CHECK (length(btrim("media_assets"."original_key")) > 0),
	CONSTRAINT "media_assets_original_content_type_check" CHECK ("media_assets"."original_content_type" IN ('image/jpeg', 'image/png', 'image/heic', 'image/heif')),
	CONSTRAINT "media_assets_original_byte_size_check" CHECK ("media_assets"."original_byte_size" BETWEEN 1 AND 52428800),
	CONSTRAINT "media_assets_original_checksum_check" CHECK ("media_assets"."original_checksum_sha256" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "media_assets_dimensions_check" CHECK (num_nonnulls("media_assets"."width", "media_assets"."height") IN (0, 2) AND ("media_assets"."width" IS NULL OR ("media_assets"."width" > 0 AND "media_assets"."height" > 0 AND ("media_assets"."width"::bigint * "media_assets"."height"::bigint) <= 100000000))),
	CONSTRAINT "media_assets_focal_point_check" CHECK (num_nonnulls("media_assets"."focal_point_x", "media_assets"."focal_point_y") IN (0, 2) AND ("media_assets"."focal_point_x" IS NULL OR ("media_assets"."focal_point_x" BETWEEN 0 AND 1 AND "media_assets"."focal_point_y" BETWEEN 0 AND 1))),
	CONSTRAINT "media_assets_camera_values_check" CHECK (("media_assets"."focal_length_millimeters" IS NULL OR "media_assets"."focal_length_millimeters" > 0) AND ("media_assets"."aperture" IS NULL OR "media_assets"."aperture" > 0) AND ("media_assets"."shutter_speed_seconds" IS NULL OR "media_assets"."shutter_speed_seconds" > 0) AND ("media_assets"."iso" IS NULL OR "media_assets"."iso" > 0)),
	CONSTRAINT "media_assets_alt_suggestion_check" CHECK (num_nonnulls("media_assets"."alt_text_suggestion_zh_hans", "media_assets"."alt_text_suggestion_en", "media_assets"."alt_text_suggestion_model", "media_assets"."alt_text_suggested_at") IN (0, 4) AND ("media_assets"."alt_text_suggestion_zh_hans" IS NULL OR (length(btrim("media_assets"."alt_text_suggestion_zh_hans")) > 0 AND length(btrim("media_assets"."alt_text_suggestion_en")) > 0 AND length(btrim("media_assets"."alt_text_suggestion_model")) > 0))),
	CONSTRAINT "media_assets_alt_text_check" CHECK (num_nonnulls("media_assets"."alt_text_zh_hans", "media_assets"."alt_text_en", "media_assets"."alt_text_approved_at") IN (0, 3) AND ("media_assets"."alt_text_zh_hans" IS NULL OR (length(btrim("media_assets"."alt_text_zh_hans")) > 0 AND length(btrim("media_assets"."alt_text_en")) > 0))),
	CONSTRAINT "media_assets_archive_check" CHECK (("media_assets"."lifecycle" = 'active' AND "media_assets"."archived_at" IS NULL AND "media_assets"."purge_started_at" IS NULL) OR ("media_assets"."lifecycle" = 'archived' AND "media_assets"."archived_at" IS NOT NULL AND "media_assets"."purge_started_at" IS NULL) OR ("media_assets"."lifecycle" = 'purging' AND "media_assets"."archived_at" IS NOT NULL AND "media_assets"."purge_started_at" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "media_renditions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"media_asset_id" uuid NOT NULL,
	"profile_width" integer NOT NULL,
	"object_key" text NOT NULL,
	"checksum_sha256" varchar(64) NOT NULL,
	"byte_size" integer NOT NULL,
	"width" integer NOT NULL,
	"height" integer NOT NULL,
	"content_type" varchar(64) DEFAULT 'image/jpeg' NOT NULL,
	"color_space" varchar(16) DEFAULT 'srgb' NOT NULL,
	"progressive" boolean DEFAULT true NOT NULL,
	"metadata_stripped" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "media_renditions_object_key_check" CHECK (length(btrim("media_renditions"."object_key")) > 0),
	CONSTRAINT "media_renditions_profile_check" CHECK ("media_renditions"."profile_width" IN (640, 1024, 1600)),
	CONSTRAINT "media_renditions_checksum_check" CHECK ("media_renditions"."checksum_sha256" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "media_renditions_dimensions_check" CHECK ("media_renditions"."width" BETWEEN 1 AND "media_renditions"."profile_width" AND "media_renditions"."height" > 0),
	CONSTRAINT "media_renditions_byte_size_check" CHECK ("media_renditions"."byte_size" > 0),
	CONSTRAINT "media_renditions_content_type_check" CHECK ("media_renditions"."content_type" = 'image/jpeg'),
	CONSTRAINT "media_renditions_color_space_check" CHECK ("media_renditions"."color_space" = 'srgb'),
	CONSTRAINT "media_renditions_progressive_check" CHECK ("media_renditions"."progressive" = true),
	CONSTRAINT "media_renditions_metadata_stripped_check" CHECK ("media_renditions"."metadata_stripped" = true)
);
--> statement-breakpoint
CREATE TABLE "media_upload_intents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_user_id" varchar(255) NOT NULL,
	"idempotency_key" varchar(128) NOT NULL,
	"original_key" text NOT NULL,
	"content_type" varchar(64) NOT NULL,
	"byte_size" integer NOT NULL,
	"checksum_sha256" varchar(64) NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "media_upload_intents_identity_check" CHECK (length(btrim("media_upload_intents"."owner_user_id")) > 0 AND length(btrim("media_upload_intents"."idempotency_key")) > 0),
	CONSTRAINT "media_upload_intents_original_key_check" CHECK (length(btrim("media_upload_intents"."original_key")) > 0),
	CONSTRAINT "media_upload_intents_content_type_check" CHECK ("media_upload_intents"."content_type" IN ('image/jpeg', 'image/png', 'image/heic', 'image/heif')),
	CONSTRAINT "media_upload_intents_byte_size_check" CHECK ("media_upload_intents"."byte_size" BETWEEN 1 AND 52428800),
	CONSTRAINT "media_upload_intents_checksum_check" CHECK ("media_upload_intents"."checksum_sha256" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "media_upload_intents_expiry_check" CHECK ("media_upload_intents"."expires_at" > "media_upload_intents"."created_at"),
	CONSTRAINT "media_upload_intents_completion_check" CHECK ("media_upload_intents"."completed_at" IS NULL OR ("media_upload_intents"."completed_at" >= "media_upload_intents"."created_at" AND "media_upload_intents"."completed_at" <= "media_upload_intents"."expires_at"))
);
--> statement-breakpoint
ALTER TABLE "media_assets" ADD CONSTRAINT "media_assets_upload_intent_id_media_upload_intents_id_fk" FOREIGN KEY ("upload_intent_id") REFERENCES "public"."media_upload_intents"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media_renditions" ADD CONSTRAINT "media_renditions_media_asset_id_media_assets_id_fk" FOREIGN KEY ("media_asset_id") REFERENCES "public"."media_assets"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "media_assets_upload_intent_uidx" ON "media_assets" USING btree ("upload_intent_id");--> statement-breakpoint
CREATE UNIQUE INDEX "media_assets_original_key_uidx" ON "media_assets" USING btree ("original_key");--> statement-breakpoint
CREATE INDEX "media_assets_library_idx" ON "media_assets" USING btree ("lifecycle","processing_state","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "media_renditions_asset_profile_uidx" ON "media_renditions" USING btree ("media_asset_id","profile_width");--> statement-breakpoint
CREATE UNIQUE INDEX "media_renditions_object_key_uidx" ON "media_renditions" USING btree ("object_key");--> statement-breakpoint
CREATE UNIQUE INDEX "media_upload_intents_owner_idempotency_uidx" ON "media_upload_intents" USING btree ("owner_user_id","idempotency_key");--> statement-breakpoint
CREATE UNIQUE INDEX "media_upload_intents_original_key_uidx" ON "media_upload_intents" USING btree ("original_key");--> statement-breakpoint
CREATE INDEX "media_upload_intents_expiry_idx" ON "media_upload_intents" USING btree ("expires_at","completed_at");