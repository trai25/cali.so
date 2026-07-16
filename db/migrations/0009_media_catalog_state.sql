ALTER TABLE "media_assets" RENAME COLUMN "lifecycle" TO "catalog_state";--> statement-breakpoint
ALTER TABLE "media_assets" RENAME CONSTRAINT "media_assets_lifecycle_check" TO "media_assets_catalog_state_check";
