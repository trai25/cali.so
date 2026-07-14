CREATE TABLE "ama_availability_windows" (
	"id" serial PRIMARY KEY NOT NULL,
	"iso_weekday" integer NOT NULL,
	"start_minute" integer NOT NULL,
	"end_minute" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ama_availability_windows_iso_weekday_check" CHECK ("ama_availability_windows"."iso_weekday" BETWEEN 1 AND 7),
	CONSTRAINT "ama_availability_windows_start_minute_check" CHECK ("ama_availability_windows"."start_minute" BETWEEN 0 AND 1439),
	CONSTRAINT "ama_availability_windows_end_minute_check" CHECK ("ama_availability_windows"."end_minute" BETWEEN 1 AND 1440),
	CONSTRAINT "ama_availability_windows_same_day_check" CHECK ("ama_availability_windows"."start_minute" < "ama_availability_windows"."end_minute")
);
--> statement-breakpoint
CREATE INDEX "ama_availability_windows_order_idx" ON "ama_availability_windows" USING btree ("iso_weekday","start_minute","end_minute");