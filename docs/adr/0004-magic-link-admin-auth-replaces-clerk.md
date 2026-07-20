# Hand-rolled magic-link auth for /admin replaces Clerk

## Status

Superseded by ADR-0009. The magic-link implementation and its public endpoints
have been removed. Its additive database tables remain historical schema until
a separately reviewed cleanup migration is appropriate.

The earlier decision removed Clerk and implemented a hand-rolled magic-link flow for one owner. Subsequent security review rejected email-only authentication as the final admin boundary. ADR-0009 restores Clerk as the sole owner authentication boundary.

## Considered Options

- **Keep Clerk admin-only** — zero code, but a permanent vendor for one user.
- **Password/passkey** — a phishable or device-bound secret; magic link keeps the email account as the single root of trust.
