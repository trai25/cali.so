# Keep owner admin behind one authoritative Clerk boundary

## Status

Accepted. This supersedes the step-up verification requirement in ADR-0009.

## Decision

Every owner-admin page, read, and mutation requires an authenticated Clerk user
whose authoritative server-loaded `publicMetadata.siteOwner` value is exactly
the string `"yes"`. High-impact actions do not add a second, time-bounded Clerk
first-factor check or trigger client-side `verifyWithPasskey()`.

The single-owner personal-site workflow did not justify repeated verification
prompts after an already authenticated owner session. The remaining controls
stay mandatory: same-origin mutation guards, per-actor rate limits,
privileged-action audit events, the admin CSP, and least-privileged provider and
database credentials. Media Asset Purge remains an explicit irreversible action
behind one fixed confirmation dialog with one destructive button; it adds no
typed phrase or second owner prompt.

Passkeys remain the recommended Clerk sign-in method and the owner should keep
two independently recoverable passkeys. Session revocation, owner-metadata
removal, and Clerk credential rotation remain the incident-response controls.

## Consequences

- Reviews must not claim that the server proves a recent factor or a passkey.
- Recovery and rotation procedures continue to verify the authoritative owner
  marker and active sessions.
- Reintroducing step-up verification requires a new threat model and an
  explicit decision covering factor semantics, recovery, and user experience.
