CREATE TABLE "ama_google_calendar_connections" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"status" varchar(32) NOT NULL,
	"calendar_id" varchar(320),
	"calendar_email" varchar(320),
	"calendar_summary" text,
	"granted_scopes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"refresh_token_envelope" jsonb,
	"access_token_expires_at" timestamp with time zone,
	"last_error_code" varchar(64),
	"connected_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ama_google_calendar_connections_singleton_check" CHECK ("ama_google_calendar_connections"."id" = 1),
	CONSTRAINT "ama_google_calendar_connections_status_check" CHECK ("ama_google_calendar_connections"."status" IN ('disconnected', 'connected', 'expired', 'revoked', 'denied_scope', 'error'))
);
