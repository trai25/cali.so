CREATE TABLE "rate_limit_windows" (
	"scope" varchar(128) NOT NULL,
	"key_hash" varchar(64) NOT NULL,
	"request_times" timestamp with time zone[] NOT NULL,
	"window_expires_at" timestamp with time zone NOT NULL,
	CONSTRAINT "rate_limit_windows_scope_key_hash_pk" PRIMARY KEY("scope","key_hash"),
	CONSTRAINT "rate_limit_windows_request_times_check" CHECK (cardinality("rate_limit_windows"."request_times") > 0)
);
--> statement-breakpoint
CREATE INDEX "rate_limit_windows_expiry_idx" ON "rate_limit_windows" USING btree ("window_expires_at");
