CREATE TABLE "ama_google_oauth_attempts" (
	"state_hash" varchar(64) PRIMARY KEY NOT NULL,
	"owner_email" varchar(320) NOT NULL,
	"pkce_verifier_envelope" jsonb NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "ama_google_oauth_attempts_expires_at_idx" ON "ama_google_oauth_attempts" USING btree ("expires_at");