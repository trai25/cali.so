# Keep the AMA journey first-party around hosted payments

AMA Sessions use a first-party availability, Booking, and lifecycle system on
cali.so, while payment is delegated to Stripe-hosted Checkout. Google Calendar
is the source of busy time and calendar invitations; Google Meet and Tencent
Meeting sit behind meeting-provider adapters; guests manage Bookings through
signed capability links instead of accounts. This keeps the guest journey and
booking rules under Cali's control without taking ownership of card-entry UI,
and replaces the v1 Alipay plus Cal.com handoff with one coherent system.

## Consequences

- A start time is held before Checkout and becomes a Booking only after a
  verified Stripe event.
- Provider work is idempotent and recoverable so a successful payment is never
  presented as a failed purchase.
- One-off unavailability is recorded in Google Calendar rather than a second
  date-exceptions system.
