CREATE TABLE "ama_availability_override_windows" (
	"id" serial PRIMARY KEY NOT NULL,
	"override_id" integer NOT NULL,
	"start_minute" integer NOT NULL,
	"end_minute" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ama_availability_override_windows_start_minute_check" CHECK ("ama_availability_override_windows"."start_minute" BETWEEN 0 AND 1439),
	CONSTRAINT "ama_availability_override_windows_end_minute_check" CHECK ("ama_availability_override_windows"."end_minute" BETWEEN 1 AND 1440),
	CONSTRAINT "ama_availability_override_windows_same_day_check" CHECK ("ama_availability_override_windows"."start_minute" < "ama_availability_override_windows"."end_minute")
);
--> statement-breakpoint
CREATE TABLE "ama_availability_overrides" (
	"id" serial PRIMARY KEY NOT NULL,
	"local_date" date NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ama_availability_settings" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"time_zone" varchar(64) DEFAULT 'Asia/Taipei' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ama_availability_settings_singleton_check" CHECK ("ama_availability_settings"."id" = 1),
	CONSTRAINT "ama_availability_settings_time_zone_check" CHECK (length(btrim("ama_availability_settings"."time_zone")) > 0)
);
--> statement-breakpoint
ALTER TABLE "ama_availability_override_windows" ADD CONSTRAINT "ama_availability_override_windows_override_id_ama_availability_overrides_id_fk" FOREIGN KEY ("override_id") REFERENCES "public"."ama_availability_overrides"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ama_availability_override_windows_order_idx" ON "ama_availability_override_windows" USING btree ("override_id","start_minute","end_minute");--> statement-breakpoint
CREATE UNIQUE INDEX "ama_availability_overrides_local_date_uidx" ON "ama_availability_overrides" USING btree ("local_date");