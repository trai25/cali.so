# Hand-rolled magic-link auth for /admin replaces Clerk

With comments and guestbook retired, auth's only job is letting one person (the site owner) into `/admin`. Clerk is removed entirely and replaced with a hand-rolled magic-link flow using the Resend integration already present for newsletters: a login request emails a single-use token (15-minute expiry) to exactly one allowlisted address, the request endpoint is rate-limited, and success issues a signed httpOnly `SameSite=Lax` session cookie (~30 days). We accepted hand-rolled auth — normally the wrong call — because the threat model is a single-user gate, and a vendor dependency for one login was the greater cost.

## Considered Options

- **Keep Clerk admin-only** — zero code, but a permanent vendor for one user.
- **Password/passkey** — a phishable or device-bound secret; magic link keeps the email account as the single root of trust.
