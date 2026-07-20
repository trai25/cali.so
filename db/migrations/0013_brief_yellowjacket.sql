CREATE TABLE "media_asset_archive_operations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_user_id" varchar(255) NOT NULL,
	"media_asset_id" uuid NOT NULL,
	"draft_id" uuid,
	"draft_revision_before" integer,
	"draft_revision_after" integer,
	"draft_position" integer,
	"published_selection_before" uuid,
	"published_selection_after" uuid,
	"archived_at" timestamp with time zone NOT NULL,
	"undo_expires_at" timestamp with time zone NOT NULL,
	"undone_at" timestamp with time zone,
	CONSTRAINT "media_asset_archive_operations_owner_check" CHECK (length(btrim("media_asset_archive_operations"."owner_user_id")) > 0),
	CONSTRAINT "media_asset_archive_operations_draft_check" CHECK (num_nonnulls("media_asset_archive_operations"."draft_id", "media_asset_archive_operations"."draft_revision_before", "media_asset_archive_operations"."draft_revision_after", "media_asset_archive_operations"."draft_position") IN (0, 4)),
	CONSTRAINT "media_asset_archive_operations_publication_check" CHECK (num_nonnulls("media_asset_archive_operations"."published_selection_before", "media_asset_archive_operations"."published_selection_after") IN (0, 2)),
	CONSTRAINT "media_asset_archive_operations_expiry_check" CHECK ("media_asset_archive_operations"."undo_expires_at" > "media_asset_archive_operations"."archived_at" AND ("media_asset_archive_operations"."undone_at" IS NULL OR "media_asset_archive_operations"."undone_at" >= "media_asset_archive_operations"."archived_at"))
);
--> statement-breakpoint
ALTER TABLE "media_published_photo_selections" DROP CONSTRAINT "media_published_photo_selections_revision_check";--> statement-breakpoint
DROP INDEX "media_published_photo_selections_draft_revision_uidx";--> statement-breakpoint
ALTER TABLE "media_published_photo_selections" ALTER COLUMN "draft_revision" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "media_published_photo_selections" ADD COLUMN "publication_kind" varchar(16) DEFAULT 'draft' NOT NULL;--> statement-breakpoint
ALTER TABLE "media_upload_intents" ADD COLUMN "discard_started_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "media_asset_archive_operations" ADD CONSTRAINT "media_asset_archive_operations_media_asset_id_media_assets_id_fk" FOREIGN KEY ("media_asset_id") REFERENCES "public"."media_assets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media_asset_archive_operations" ADD CONSTRAINT "media_asset_archive_operations_draft_id_media_photo_selection_drafts_id_fk" FOREIGN KEY ("draft_id") REFERENCES "public"."media_photo_selection_drafts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media_asset_archive_operations" ADD CONSTRAINT "media_asset_archive_operations_published_selection_before_media_published_photo_selections_id_fk" FOREIGN KEY ("published_selection_before") REFERENCES "public"."media_published_photo_selections"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media_asset_archive_operations" ADD CONSTRAINT "media_asset_archive_operations_published_selection_after_media_published_photo_selections_id_fk" FOREIGN KEY ("published_selection_after") REFERENCES "public"."media_published_photo_selections"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "media_asset_archive_operations_owner_idx" ON "media_asset_archive_operations" USING btree ("owner_user_id","media_asset_id","undo_expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "media_published_photo_selections_draft_revision_uidx" ON "media_published_photo_selections" USING btree ("owner_user_id","draft_revision") WHERE "media_published_photo_selections"."publication_kind" = 'draft';--> statement-breakpoint
ALTER TABLE "media_published_photo_selections" ADD CONSTRAINT "media_published_photo_selections_kind_check" CHECK ("media_published_photo_selections"."publication_kind" IN ('draft', 'withdrawal'));--> statement-breakpoint
ALTER TABLE "media_published_photo_selections" ADD CONSTRAINT "media_published_photo_selections_revision_check" CHECK (("media_published_photo_selections"."publication_kind" = 'draft' AND "media_published_photo_selections"."draft_revision" >= 0) OR ("media_published_photo_selections"."publication_kind" = 'withdrawal' AND "media_published_photo_selections"."draft_revision" IS NULL));--> statement-breakpoint
ALTER TABLE "media_upload_intents" ADD CONSTRAINT "media_upload_intents_discard_check" CHECK ("media_upload_intents"."discard_started_at" IS NULL OR ("media_upload_intents"."completed_at" IS NULL AND "media_upload_intents"."discard_started_at" >= "media_upload_intents"."created_at"));