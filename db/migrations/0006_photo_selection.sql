CREATE TABLE "media_active_photo_publication" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"published_selection_id" uuid NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "media_active_photo_publication_singleton_check" CHECK ("media_active_photo_publication"."id" = 1)
);
--> statement-breakpoint
CREATE TABLE "media_photo_selection_draft_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"draft_id" uuid NOT NULL,
	"media_asset_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "media_photo_selection_draft_entries_position_check" CHECK ("media_photo_selection_draft_entries"."position" >= 0)
);
--> statement-breakpoint
CREATE TABLE "media_photo_selection_drafts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_user_id" varchar(255) NOT NULL,
	"revision" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "media_photo_selection_drafts_owner_check" CHECK (length(btrim("media_photo_selection_drafts"."owner_user_id")) > 0),
	CONSTRAINT "media_photo_selection_drafts_revision_check" CHECK ("media_photo_selection_drafts"."revision" >= 0)
);
--> statement-breakpoint
CREATE TABLE "media_published_photo_selection_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"published_selection_id" uuid NOT NULL,
	"source_media_asset_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"width" integer NOT NULL,
	"height" integer NOT NULL,
	"focal_point_x" numeric(5, 4),
	"focal_point_y" numeric(5, 4),
	"alt_text_zh_hans" text NOT NULL,
	"alt_text_en" text NOT NULL,
	"location_label_zh_hans" text,
	"location_label_en" text,
	"captured_at" timestamp with time zone,
	"camera_make" text,
	"camera_model" text,
	"lens" text,
	"focal_length_millimeters" numeric(8, 3),
	"aperture" numeric(6, 3),
	"shutter_speed_seconds" numeric(12, 8),
	"iso" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "media_published_photo_selection_entries_position_check" CHECK ("media_published_photo_selection_entries"."position" >= 0),
	CONSTRAINT "media_published_photo_selection_entries_dimensions_check" CHECK ("media_published_photo_selection_entries"."width" > 0 AND "media_published_photo_selection_entries"."height" > 0 AND ("media_published_photo_selection_entries"."width"::bigint * "media_published_photo_selection_entries"."height"::bigint) <= 100000000),
	CONSTRAINT "media_published_photo_selection_entries_focal_point_check" CHECK (num_nonnulls("media_published_photo_selection_entries"."focal_point_x", "media_published_photo_selection_entries"."focal_point_y") IN (0, 2) AND ("media_published_photo_selection_entries"."focal_point_x" IS NULL OR ("media_published_photo_selection_entries"."focal_point_x" BETWEEN 0 AND 1 AND "media_published_photo_selection_entries"."focal_point_y" BETWEEN 0 AND 1))),
	CONSTRAINT "media_published_photo_selection_entries_alt_text_check" CHECK (length(btrim("media_published_photo_selection_entries"."alt_text_zh_hans")) > 0 AND length(btrim("media_published_photo_selection_entries"."alt_text_en")) > 0),
	CONSTRAINT "media_published_photo_selection_entries_camera_values_check" CHECK (("media_published_photo_selection_entries"."focal_length_millimeters" IS NULL OR "media_published_photo_selection_entries"."focal_length_millimeters" > 0) AND ("media_published_photo_selection_entries"."aperture" IS NULL OR "media_published_photo_selection_entries"."aperture" > 0) AND ("media_published_photo_selection_entries"."shutter_speed_seconds" IS NULL OR "media_published_photo_selection_entries"."shutter_speed_seconds" > 0) AND ("media_published_photo_selection_entries"."iso" IS NULL OR "media_published_photo_selection_entries"."iso" > 0))
);
--> statement-breakpoint
CREATE TABLE "media_published_photo_selection_renditions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"published_entry_id" uuid NOT NULL,
	"profile_width" integer NOT NULL,
	"object_key" text NOT NULL,
	"width" integer NOT NULL,
	"height" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "media_published_photo_selection_renditions_profile_check" CHECK ("media_published_photo_selection_renditions"."profile_width" IN (640, 1024, 1600)),
	CONSTRAINT "media_published_photo_selection_renditions_object_key_check" CHECK (length(btrim("media_published_photo_selection_renditions"."object_key")) > 0),
	CONSTRAINT "media_published_photo_selection_renditions_dimensions_check" CHECK ("media_published_photo_selection_renditions"."width" BETWEEN 1 AND "media_published_photo_selection_renditions"."profile_width" AND "media_published_photo_selection_renditions"."height" > 0 AND ("media_published_photo_selection_renditions"."width"::bigint * "media_published_photo_selection_renditions"."height"::bigint) <= 100000000)
);
--> statement-breakpoint
CREATE TABLE "media_published_photo_selections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_user_id" varchar(255) NOT NULL,
	"idempotency_key" varchar(128) NOT NULL,
	"draft_revision" integer NOT NULL,
	"item_count" integer NOT NULL,
	"published_at" timestamp with time zone NOT NULL,
	CONSTRAINT "media_published_photo_selections_identity_check" CHECK (length(btrim("media_published_photo_selections"."owner_user_id")) > 0 AND length(btrim("media_published_photo_selections"."idempotency_key")) > 0),
	CONSTRAINT "media_published_photo_selections_revision_check" CHECK ("media_published_photo_selections"."draft_revision" >= 0),
	CONSTRAINT "media_published_photo_selections_item_count_check" CHECK ("media_published_photo_selections"."item_count" >= 0)
);
--> statement-breakpoint
ALTER TABLE "media_active_photo_publication" ADD CONSTRAINT "media_active_photo_publication_published_selection_id_media_published_photo_selections_id_fk" FOREIGN KEY ("published_selection_id") REFERENCES "public"."media_published_photo_selections"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media_photo_selection_draft_entries" ADD CONSTRAINT "media_photo_selection_draft_entries_draft_id_media_photo_selection_drafts_id_fk" FOREIGN KEY ("draft_id") REFERENCES "public"."media_photo_selection_drafts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media_photo_selection_draft_entries" ADD CONSTRAINT "media_photo_selection_draft_entries_media_asset_id_media_assets_id_fk" FOREIGN KEY ("media_asset_id") REFERENCES "public"."media_assets"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media_published_photo_selection_entries" ADD CONSTRAINT "media_published_photo_selection_entries_published_selection_id_media_published_photo_selections_id_fk" FOREIGN KEY ("published_selection_id") REFERENCES "public"."media_published_photo_selections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media_published_photo_selection_renditions" ADD CONSTRAINT "media_published_photo_selection_renditions_published_entry_id_media_published_photo_selection_entries_id_fk" FOREIGN KEY ("published_entry_id") REFERENCES "public"."media_published_photo_selection_entries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "media_active_photo_publication_selection_uidx" ON "media_active_photo_publication" USING btree ("published_selection_id");--> statement-breakpoint
CREATE UNIQUE INDEX "media_photo_selection_draft_entries_asset_uidx" ON "media_photo_selection_draft_entries" USING btree ("draft_id","media_asset_id");--> statement-breakpoint
CREATE UNIQUE INDEX "media_photo_selection_draft_entries_position_uidx" ON "media_photo_selection_draft_entries" USING btree ("draft_id","position");--> statement-breakpoint
CREATE UNIQUE INDEX "media_photo_selection_drafts_owner_uidx" ON "media_photo_selection_drafts" USING btree ("owner_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "media_published_photo_selection_entries_asset_uidx" ON "media_published_photo_selection_entries" USING btree ("published_selection_id","source_media_asset_id");--> statement-breakpoint
CREATE UNIQUE INDEX "media_published_photo_selection_entries_position_uidx" ON "media_published_photo_selection_entries" USING btree ("published_selection_id","position");--> statement-breakpoint
CREATE UNIQUE INDEX "media_published_photo_selection_renditions_profile_uidx" ON "media_published_photo_selection_renditions" USING btree ("published_entry_id","profile_width");--> statement-breakpoint
CREATE UNIQUE INDEX "media_published_photo_selections_idempotency_uidx" ON "media_published_photo_selections" USING btree ("owner_user_id","idempotency_key");--> statement-breakpoint
CREATE FUNCTION media_reject_published_photo_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
	RAISE EXCEPTION 'Published Photo Selection snapshots are immutable';
END;
$$;--> statement-breakpoint
CREATE TRIGGER media_published_photo_selections_immutable
BEFORE UPDATE OR DELETE ON media_published_photo_selections
FOR EACH ROW EXECUTE FUNCTION media_reject_published_photo_mutation();--> statement-breakpoint
CREATE TRIGGER media_published_photo_selection_entries_immutable
BEFORE UPDATE OR DELETE ON media_published_photo_selection_entries
FOR EACH ROW EXECUTE FUNCTION media_reject_published_photo_mutation();--> statement-breakpoint
CREATE TRIGGER media_published_photo_selection_renditions_immutable
BEFORE UPDATE OR DELETE ON media_published_photo_selection_renditions
FOR EACH ROW EXECUTE FUNCTION media_reject_published_photo_mutation();
