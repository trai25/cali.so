CREATE TABLE IF NOT EXISTS "ama_auth_tokens" (
	"token_hash" varchar(64) PRIMARY KEY NOT NULL,
	"owner_email" varchar(320) NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ama_auth_tokens_expires_at_idx" ON "ama_auth_tokens" USING btree ("expires_at");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "ama_admin_sessions" (
	"token_hash" varchar(64) PRIMARY KEY NOT NULL,
	"owner_email" varchar(320) NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ama_admin_sessions_expires_at_idx" ON "ama_admin_sessions" USING btree ("expires_at");
