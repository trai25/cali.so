CREATE TABLE "ama_availability_weekdays" (
	"iso_weekday" integer PRIMARY KEY NOT NULL,
	"enabled" boolean NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ama_availability_weekdays_iso_weekday_check" CHECK ("ama_availability_weekdays"."iso_weekday" BETWEEN 1 AND 7)
);
