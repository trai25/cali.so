# AMA booking operations

The paid AMA booking system (issue #79, slices #82 through #87) is fully
implemented and fails closed behind the five `AMA_*_ENABLED` switches. This
document records the environment contract and the operating lifecycle. No
secret values belong in this file, in the repository, or in issue threads.

## Environment contract

Validation lives in `lib/ama/server-env-schema.ts`; misconfiguration fails at
startup with field names only. `.env.example` mirrors this table.

| Variable | Required when | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | always | CRUD-only Postgres role. Never the migration credential. |
| `ADMIN_EMAIL` | always | Owner data namespace and Google Calendar owner. |
| `AMA_ENCRYPTION_KEY` | always | 32-byte base64 key: Google refresh-token envelopes and Manage Link token derivation. |
| `RATE_LIMIT_HASH_KEY` | always | 32-byte base64 key pseudonymizing rate-limit and audit actors, including public booking clients. |
| `SITE_URL` | always | Canonical public origin. Anchors same-origin mutation checks, Stripe return URLs, and Manage Link URLs. |
| `CRON_SECRET` | scheduled work | Bearer secret for `/api/internal/ama/work` (and media reconcile). Vercel injects it for cron invocations. |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | `AMA_GOOGLE_INTEGRATION_ENABLED=true` | OAuth client for free/busy and calendar event writes. |
| `STRIPE_SECRET_KEY` | `AMA_PAYMENTS_ENABLED=true` | Checkout Session and refund API access. |
| `STRIPE_WEBHOOK_SECRET` | `AMA_PAYMENTS_ENABLED=true` | Signs `/api/ama/stripe/webhook`; the webhook, never the return URL, is authoritative for payment. |
| `RESEND_API_KEY` | `AMA_BOOKING_FINALIZATION_ENABLED=true` | Transactional email delivery. |
| `AMA_EMAIL_FROM` | `AMA_BOOKING_FINALIZATION_ENABLED=true` | Sender, `Name <address@domain>` accepted. |
| `TENCENT_MEETING_MCP_URL` / `TENCENT_MEETING_MCP_TOKEN` | `AMA_TENCENT_INTEGRATION_ENABLED=true` | Server-only MCP bridge; the token travels as `X-Tencent-Meeting-Token` and never reaches logs or errors. |
| `AMA_PUBLIC_RATE_LIMIT_MAX_REQUESTS` / `_WINDOW_SECONDS` | optional | Public mutation rate limit (defaults 10 per 60s). Backend follows the environment: Upstash in Production, Neon windows in Preview, process-local elsewhere. |
| `ADMIN_MUTATION_RATE_LIMIT_MAX_REQUESTS` / `_WINDOW_SECONDS` | optional | Owner admin mutation limit. |

The launch switches themselves: `AMA_PUBLIC_MUTATIONS_ENABLED` (holds and
Alternate Time Requests), `AMA_PAYMENTS_ENABLED` (Checkout and webhook),
`AMA_BOOKING_FINALIZATION_ENABLED` (meetings, email, Manage Link actions),
`AMA_GOOGLE_INTEGRATION_ENABLED`, `AMA_TENCENT_INTEGRATION_ENABLED`. Every
switch defaults to false and every gated route returns 503 before touching
provider code. All five stay `false` for the v3 production launch.

## Lifecycle summary

1. `/ama` presents the offer; `/ama/book` collects intake and shows slots from
   the availability engine (owner windows in Asia/Taipei, Google free/busy,
   active Slot Holds, Bookings, 24h notice, 30-day horizon, 15-minute
   buffers).
2. Selecting a time creates a 15-minute Slot Hold. Postgres enforces
   non-overlap through an exclusion constraint on the buffered interval, so
   racing guests cannot both win.
3. Checkout is Stripe-hosted (US$99), idempotent per hold. The signed webhook
   converts the hold into a Booking exactly once; provider event ids are
   persisted before side effects. A payment that lands after hold expiry
   either reclaims the interval or parks the paid Booking in
   `needs_reschedule` for the guest to pick a new time.
4. Finalization runs as durable operations (leases, bounded backoff, terminal
   failure states): meeting creation (Google Meet through the Calendar
   conference contract with a deterministic event id; Tencent Meeting through
   the MCP bridge with the link carried in an ordinary calendar event),
   confirmation email with the private Manage Link, 24h and 1h reminders, and
   a Booking Brief purge 90 days after the session.
5. Guests manage Bookings through the Manage Link: reschedule or cancel until
   24 hours before the session; eligible cancellations refund automatically
   and idempotently. Admin (`/admin/ama`) operates Bookings, Alternate Time
   Requests, refund exceptions, retries, and manual resolution.

## Scheduled work

`vercel.json` runs `/api/internal/ama/work` every five minutes with
`CRON_SECRET` bearer auth. Each run releases expired Slot Holds and drains due
durable operations under leases; an interrupted worker's lease expires and the
next run reclaims the work, so no step depends on a healthy previous run.

## Recovery

- A paid Booking whose provider work keeps failing stays `finalizing`
  (Finalizing Booking) and appears in the admin attention list with retry and
  manual-resolution actions. Payment success is never presented as failure.
- Refund failures park as `refund_status=failed` with a terminal operation;
  admin can retry or grant the refund manually in Stripe and mark the
  operation resolved.
- Tencent Meeting exposes no guaranteed room deletion. Cancellation removes
  the Google Calendar event and attempts Tencent cleanup when the bridge
  offers a cancel tool; the limitation is recorded on the lifecycle event.

## Privacy

- Manage Link tokens are derived per Booking with HMAC under
  `AMA_ENCRYPTION_KEY`; only SHA-256 hashes are stored, and tokens never
  appear in logs, analytics, or Stripe metadata (which carries opaque ids
  only).
- Funnel analytics (`lib/analytics.ts`) emit event names only, with no
  identity, topics, brief, URL, payment, or token context.
- Booking Brief text and links are purged 90 days after the session while
  financial and scheduling records remain for reconciliation.
