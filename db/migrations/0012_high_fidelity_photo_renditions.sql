ALTER TABLE "media_published_photo_selection_renditions" ADD CONSTRAINT "media_published_photo_selection_renditions_profile_check_v2" CHECK ("media_published_photo_selection_renditions"."profile_width" IN (640, 1024, 1600, 2560)) NOT VALID;--> statement-breakpoint
ALTER TABLE "media_published_photo_selection_renditions" VALIDATE CONSTRAINT "media_published_photo_selection_renditions_profile_check_v2";--> statement-breakpoint
ALTER TABLE "media_published_photo_selection_renditions" DROP CONSTRAINT "media_published_photo_selection_renditions_profile_check";--> statement-breakpoint
ALTER TABLE "media_published_photo_selection_renditions" RENAME CONSTRAINT "media_published_photo_selection_renditions_profile_check_v2" TO "media_published_photo_selection_renditions_profile_check";--> statement-breakpoint
ALTER TABLE "media_renditions" ADD CONSTRAINT "media_renditions_profile_check_v2" CHECK ("media_renditions"."profile_width" IN (640, 1024, 1600, 2560)) NOT VALID;--> statement-breakpoint
ALTER TABLE "media_renditions" VALIDATE CONSTRAINT "media_renditions_profile_check_v2";--> statement-breakpoint
ALTER TABLE "media_renditions" DROP CONSTRAINT "media_renditions_profile_check";--> statement-breakpoint
ALTER TABLE "media_renditions" RENAME CONSTRAINT "media_renditions_profile_check_v2" TO "media_renditions_profile_check";
