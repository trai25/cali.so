# Hand-rolled magic-link auth for /admin replaces Clerk

## Status

Superseded by [issue #93](https://github.com/CaliCastle/cali.so/issues/93).
The magic-link implementation remains historical groundwork, but v3 launches
with owner admin available under the existing authentication boundary, as
recorded by ADR-0008. Public AMA capabilities remain disabled. Clerk-based
owner authentication and recovery remains the intended successor without
making admin availability depend on an environment switch.

The earlier decision removed Clerk and implemented a hand-rolled magic-link flow for one owner. Subsequent security review rejected email-only authentication as the final admin boundary. Issue #93 replaces this design with Clerk-based owner authentication, passkeys, and explicit recovery controls.

## Considered Options

- **Keep Clerk admin-only** — zero code, but a permanent vendor for one user.
- **Password/passkey** — a phishable or device-bound secret; magic link keeps the email account as the single root of trust.
