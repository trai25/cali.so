CREATE TABLE "media_asset_purge_jobs" (
	"media_asset_id" uuid PRIMARY KEY NOT NULL,
	"owner_user_id" varchar(255) NOT NULL,
	"original_key" text,
	"started_at" timestamp with time zone NOT NULL,
	"original_deleted_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"claim_token" uuid,
	"claim_expires_at" timestamp with time zone,
	"last_error_code" varchar(64),
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "media_asset_purge_jobs_owner_check" CHECK (length(btrim("media_asset_purge_jobs"."owner_user_id")) > 0),
	CONSTRAINT "media_asset_purge_jobs_claim_check" CHECK (num_nonnulls("media_asset_purge_jobs"."claim_token", "media_asset_purge_jobs"."claim_expires_at") IN (0, 2)),
	CONSTRAINT "media_asset_purge_jobs_error_check" CHECK ("media_asset_purge_jobs"."last_error_code" IS NULL OR length(btrim("media_asset_purge_jobs"."last_error_code")) > 0),
	CONSTRAINT "media_asset_purge_jobs_completion_check" CHECK (("media_asset_purge_jobs"."completed_at" IS NULL AND "media_asset_purge_jobs"."original_key" IS NOT NULL) OR ("media_asset_purge_jobs"."completed_at" IS NOT NULL AND "media_asset_purge_jobs"."original_key" IS NULL AND "media_asset_purge_jobs"."original_deleted_at" IS NOT NULL AND "media_asset_purge_jobs"."claim_token" IS NULL AND "media_asset_purge_jobs"."claim_expires_at" IS NULL AND "media_asset_purge_jobs"."last_error_code" IS NULL))
);
--> statement-breakpoint
CREATE TABLE "media_asset_purge_renditions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"media_asset_id" uuid NOT NULL,
	"object_key" text NOT NULL,
	"object_deleted_at" timestamp with time zone,
	"cdn_purged_at" timestamp with time zone,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "media_asset_purge_renditions_object_key_check" CHECK (length(btrim("media_asset_purge_renditions"."object_key")) > 0),
	CONSTRAINT "media_asset_purge_renditions_progress_check" CHECK ("media_asset_purge_renditions"."cdn_purged_at" IS NULL OR "media_asset_purge_renditions"."object_deleted_at" IS NOT NULL)
);
--> statement-breakpoint
ALTER TABLE "media_asset_purge_renditions" ADD CONSTRAINT "media_asset_purge_renditions_media_asset_id_media_asset_purge_jobs_media_asset_id_fk" FOREIGN KEY ("media_asset_id") REFERENCES "public"."media_asset_purge_jobs"("media_asset_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "media_asset_purge_jobs_owner_idx" ON "media_asset_purge_jobs" USING btree ("owner_user_id","completed_at","updated_at");--> statement-breakpoint
CREATE UNIQUE INDEX "media_asset_purge_renditions_object_uidx" ON "media_asset_purge_renditions" USING btree ("media_asset_id","object_key");
