CREATE TABLE "ama_alternate_time_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"guest_name" varchar(120) NOT NULL,
	"guest_email" varchar(320) NOT NULL,
	"locale" varchar(2) NOT NULL,
	"guest_time_zone" varchar(64) NOT NULL,
	"preferred_windows" text NOT NULL,
	"note" text,
	"status" varchar(16) DEFAULT 'new' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone,
	CONSTRAINT "ama_alternate_time_requests_guest_check" CHECK (length(btrim("ama_alternate_time_requests"."guest_name")) > 0 AND length(btrim("ama_alternate_time_requests"."guest_email")) > 0),
	CONSTRAINT "ama_alternate_time_requests_locale_check" CHECK ("ama_alternate_time_requests"."locale" IN ('zh', 'en')),
	CONSTRAINT "ama_alternate_time_requests_windows_check" CHECK (length(btrim("ama_alternate_time_requests"."preferred_windows")) > 0 AND char_length("ama_alternate_time_requests"."preferred_windows") <= 1000),
	CONSTRAINT "ama_alternate_time_requests_note_check" CHECK ("ama_alternate_time_requests"."note" IS NULL OR char_length("ama_alternate_time_requests"."note") <= 1000),
	CONSTRAINT "ama_alternate_time_requests_status_check" CHECK ("ama_alternate_time_requests"."status" IN ('new', 'resolved', 'dismissed')),
	CONSTRAINT "ama_alternate_time_requests_resolution_check" CHECK (("ama_alternate_time_requests"."status" = 'new') = ("ama_alternate_time_requests"."resolved_at" IS NULL))
);
--> statement-breakpoint
CREATE TABLE "ama_booking_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"booking_id" uuid NOT NULL,
	"event" varchar(48) NOT NULL,
	"actor" varchar(16) NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"detail" jsonb DEFAULT '{}'::jsonb NOT NULL,
	CONSTRAINT "ama_booking_events_event_check" CHECK (length(btrim("ama_booking_events"."event")) > 0),
	CONSTRAINT "ama_booking_events_actor_check" CHECK ("ama_booking_events"."actor" IN ('guest', 'owner', 'system', 'provider'))
);
--> statement-breakpoint
CREATE TABLE "ama_booking_intents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"hold_claim_id" uuid NOT NULL,
	"guest_name" varchar(120) NOT NULL,
	"guest_email" varchar(320) NOT NULL,
	"locale" varchar(2) NOT NULL,
	"guest_time_zone" varchar(64) NOT NULL,
	"topics" jsonb NOT NULL,
	"brief_text" text NOT NULL,
	"brief_urls" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"meeting_provider" varchar(20) NOT NULL,
	"stripe_checkout_session_id" varchar(255),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ama_booking_intents_guest_check" CHECK (length(btrim("ama_booking_intents"."guest_name")) > 0 AND length(btrim("ama_booking_intents"."guest_email")) > 0),
	CONSTRAINT "ama_booking_intents_locale_check" CHECK ("ama_booking_intents"."locale" IN ('zh', 'en')),
	CONSTRAINT "ama_booking_intents_time_zone_check" CHECK (length(btrim("ama_booking_intents"."guest_time_zone")) > 0),
	CONSTRAINT "ama_booking_intents_topics_check" CHECK (jsonb_typeof("ama_booking_intents"."topics") = 'array' AND jsonb_array_length("ama_booking_intents"."topics") BETWEEN 1 AND 8),
	CONSTRAINT "ama_booking_intents_brief_check" CHECK (length(btrim("ama_booking_intents"."brief_text")) > 0 AND char_length("ama_booking_intents"."brief_text") <= 2000),
	CONSTRAINT "ama_booking_intents_brief_urls_check" CHECK (jsonb_typeof("ama_booking_intents"."brief_urls") = 'array' AND jsonb_array_length("ama_booking_intents"."brief_urls") <= 5),
	CONSTRAINT "ama_booking_intents_provider_check" CHECK ("ama_booking_intents"."meeting_provider" IN ('google-meet', 'tencent-meeting'))
);
--> statement-breakpoint
CREATE TABLE "ama_bookings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"intent_id" uuid NOT NULL,
	"claim_id" uuid,
	"status" varchar(20) DEFAULT 'finalizing' NOT NULL,
	"guest_name" varchar(120) NOT NULL,
	"guest_email" varchar(320) NOT NULL,
	"locale" varchar(2) NOT NULL,
	"guest_time_zone" varchar(64) NOT NULL,
	"topics" jsonb NOT NULL,
	"brief_text" text,
	"brief_urls" jsonb,
	"brief_purged_at" timestamp with time zone,
	"meeting_provider" varchar(20) NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"stripe_checkout_session_id" varchar(255) NOT NULL,
	"stripe_payment_intent_id" varchar(255),
	"amount_total" integer NOT NULL,
	"currency" varchar(8) NOT NULL,
	"refund_status" varchar(16) DEFAULT 'none' NOT NULL,
	"stripe_refund_id" varchar(255),
	"refunded_at" timestamp with time zone,
	"refund_reason" varchar(32),
	"cancelled_at" timestamp with time zone,
	"cancelled_by" varchar(16),
	"meeting_url" text,
	"google_calendar_event_id" varchar(255),
	"tencent_meeting_id" varchar(255),
	"meeting_created_at" timestamp with time zone,
	"manage_token_hash" varchar(64),
	"manage_token_issued_at" timestamp with time zone,
	"manage_token_revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ama_bookings_status_check" CHECK ("ama_bookings"."status" IN ('finalizing', 'confirmed', 'needs_reschedule', 'cancelled')),
	CONSTRAINT "ama_bookings_locale_check" CHECK ("ama_bookings"."locale" IN ('zh', 'en')),
	CONSTRAINT "ama_bookings_provider_check" CHECK ("ama_bookings"."meeting_provider" IN ('google-meet', 'tencent-meeting')),
	CONSTRAINT "ama_bookings_interval_check" CHECK ("ama_bookings"."starts_at" < "ama_bookings"."ends_at"),
	CONSTRAINT "ama_bookings_claim_presence_check" CHECK ("ama_bookings"."status" IN ('needs_reschedule', 'cancelled') OR "ama_bookings"."claim_id" IS NOT NULL),
	CONSTRAINT "ama_bookings_refund_status_check" CHECK ("ama_bookings"."refund_status" IN ('none', 'pending', 'refunded', 'failed')),
	CONSTRAINT "ama_bookings_refund_reason_check" CHECK ("ama_bookings"."refund_reason" IS NULL OR "ama_bookings"."refund_reason" IN ('guest_cancellation', 'owner_cancellation', 'owner_exception')),
	CONSTRAINT "ama_bookings_cancellation_check" CHECK (("ama_bookings"."status" = 'cancelled') = ("ama_bookings"."cancelled_at" IS NOT NULL AND "ama_bookings"."cancelled_by" IS NOT NULL)),
	CONSTRAINT "ama_bookings_cancelled_by_check" CHECK ("ama_bookings"."cancelled_by" IS NULL OR "ama_bookings"."cancelled_by" IN ('guest', 'owner')),
	CONSTRAINT "ama_bookings_brief_purge_check" CHECK (("ama_bookings"."brief_purged_at" IS NULL AND "ama_bookings"."brief_text" IS NOT NULL AND "ama_bookings"."brief_urls" IS NOT NULL) OR ("ama_bookings"."brief_purged_at" IS NOT NULL AND "ama_bookings"."brief_text" IS NULL AND "ama_bookings"."brief_urls" IS NULL)),
	CONSTRAINT "ama_bookings_manage_token_check" CHECK (("ama_bookings"."manage_token_hash" IS NULL) = ("ama_bookings"."manage_token_issued_at" IS NULL)),
	CONSTRAINT "ama_bookings_amount_check" CHECK ("ama_bookings"."amount_total" > 0)
);
--> statement-breakpoint
CREATE TABLE "ama_durable_operations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" varchar(48) NOT NULL,
	"dedupe_key" varchar(255) NOT NULL,
	"booking_id" uuid,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" varchar(16) DEFAULT 'pending' NOT NULL,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"max_attempts" integer DEFAULT 8 NOT NULL,
	"next_attempt_at" timestamp with time zone NOT NULL,
	"lease_token" uuid,
	"lease_expires_at" timestamp with time zone,
	"last_error_code" varchar(64),
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ama_durable_operations_kind_check" CHECK (length(btrim("ama_durable_operations"."kind")) > 0),
	CONSTRAINT "ama_durable_operations_status_check" CHECK ("ama_durable_operations"."status" IN ('pending', 'running', 'succeeded', 'failed', 'cancelled', 'resolved')),
	CONSTRAINT "ama_durable_operations_attempts_check" CHECK ("ama_durable_operations"."attempt_count" >= 0 AND "ama_durable_operations"."max_attempts" > 0),
	CONSTRAINT "ama_durable_operations_lease_check" CHECK (num_nonnulls("ama_durable_operations"."lease_token", "ama_durable_operations"."lease_expires_at") IN (0, 2)),
	CONSTRAINT "ama_durable_operations_completion_check" CHECK (("ama_durable_operations"."status" IN ('succeeded', 'failed', 'cancelled', 'resolved')) = ("ama_durable_operations"."completed_at" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "ama_provider_events" (
	"provider" varchar(16) NOT NULL,
	"event_id" varchar(255) NOT NULL,
	"event_type" varchar(64) NOT NULL,
	"received_at" timestamp with time zone NOT NULL,
	"processed_at" timestamp with time zone,
	"outcome" varchar(32),
	CONSTRAINT "ama_provider_events_provider_event_id_pk" PRIMARY KEY("provider","event_id"),
	CONSTRAINT "ama_provider_events_provider_check" CHECK ("ama_provider_events"."provider" = 'stripe'),
	CONSTRAINT "ama_provider_events_identity_check" CHECK (length(btrim("ama_provider_events"."event_id")) > 0 AND length(btrim("ama_provider_events"."event_type")) > 0)
);
--> statement-breakpoint
CREATE TABLE "ama_slot_claims" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" varchar(16) NOT NULL,
	"status" varchar(16) DEFAULT 'active' NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"blocked_during" "tstzrange" NOT NULL,
	"expires_at" timestamp with time zone,
	"released_at" timestamp with time zone,
	"release_reason" varchar(32),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ama_slot_claims_kind_check" CHECK ("ama_slot_claims"."kind" IN ('hold', 'booking')),
	CONSTRAINT "ama_slot_claims_status_check" CHECK ("ama_slot_claims"."status" IN ('active', 'released')),
	CONSTRAINT "ama_slot_claims_interval_check" CHECK ("ama_slot_claims"."starts_at" < "ama_slot_claims"."ends_at"),
	CONSTRAINT "ama_slot_claims_blocked_during_check" CHECK ("ama_slot_claims"."blocked_during" = tstzrange("ama_slot_claims"."starts_at" - interval '15 minutes', "ama_slot_claims"."ends_at" + interval '15 minutes', '[)')),
	CONSTRAINT "ama_slot_claims_hold_expiry_check" CHECK (("ama_slot_claims"."kind" = 'hold') = ("ama_slot_claims"."expires_at" IS NOT NULL)),
	CONSTRAINT "ama_slot_claims_release_check" CHECK (("ama_slot_claims"."status" = 'active' AND "ama_slot_claims"."released_at" IS NULL AND "ama_slot_claims"."release_reason" IS NULL) OR ("ama_slot_claims"."status" = 'released' AND "ama_slot_claims"."released_at" IS NOT NULL AND "ama_slot_claims"."release_reason" IS NOT NULL)),
	CONSTRAINT "ama_slot_claims_no_overlap" EXCLUDE USING gist ("blocked_during" WITH &&) WHERE ("status" = 'active')
);
--> statement-breakpoint
ALTER TABLE "ama_booking_events" ADD CONSTRAINT "ama_booking_events_booking_id_ama_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."ama_bookings"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ama_booking_intents" ADD CONSTRAINT "ama_booking_intents_hold_claim_id_ama_slot_claims_id_fk" FOREIGN KEY ("hold_claim_id") REFERENCES "public"."ama_slot_claims"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ama_bookings" ADD CONSTRAINT "ama_bookings_intent_id_ama_booking_intents_id_fk" FOREIGN KEY ("intent_id") REFERENCES "public"."ama_booking_intents"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ama_bookings" ADD CONSTRAINT "ama_bookings_claim_id_ama_slot_claims_id_fk" FOREIGN KEY ("claim_id") REFERENCES "public"."ama_slot_claims"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ama_durable_operations" ADD CONSTRAINT "ama_durable_operations_booking_id_ama_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."ama_bookings"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ama_alternate_time_requests_status_idx" ON "ama_alternate_time_requests" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "ama_booking_events_booking_idx" ON "ama_booking_events" USING btree ("booking_id","occurred_at");--> statement-breakpoint
CREATE UNIQUE INDEX "ama_booking_intents_hold_claim_uidx" ON "ama_booking_intents" USING btree ("hold_claim_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ama_booking_intents_checkout_session_uidx" ON "ama_booking_intents" USING btree ("stripe_checkout_session_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ama_bookings_intent_uidx" ON "ama_bookings" USING btree ("intent_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ama_bookings_checkout_session_uidx" ON "ama_bookings" USING btree ("stripe_checkout_session_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ama_bookings_manage_token_uidx" ON "ama_bookings" USING btree ("manage_token_hash");--> statement-breakpoint
CREATE INDEX "ama_bookings_schedule_idx" ON "ama_bookings" USING btree ("status","starts_at");--> statement-breakpoint
CREATE INDEX "ama_bookings_claim_idx" ON "ama_bookings" USING btree ("claim_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ama_durable_operations_dedupe_uidx" ON "ama_durable_operations" USING btree ("dedupe_key");--> statement-breakpoint
CREATE INDEX "ama_durable_operations_due_idx" ON "ama_durable_operations" USING btree ("status","next_attempt_at");--> statement-breakpoint
CREATE INDEX "ama_durable_operations_booking_idx" ON "ama_durable_operations" USING btree ("booking_id");--> statement-breakpoint
CREATE INDEX "ama_slot_claims_active_idx" ON "ama_slot_claims" USING btree ("status","ends_at");--> statement-breakpoint
CREATE INDEX "ama_slot_claims_expiry_idx" ON "ama_slot_claims" USING btree ("status","expires_at");