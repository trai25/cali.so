# Drive AMA capabilities from complete provider credentials

## Status

Accepted. This supersedes the public-AMA launch-disable sentence in ADR-0003,
the independent capability-switch requirement in ADR-0008 and ADR-0009, and
the corresponding kill-switch requirement in the security baseline.

## Decision

Public AMA mutations are available by default. A provider-backed capability is
available only when its complete credential pair is configured in that
environment:

- Stripe secret and webhook keys enable payment operations;
- Resend key and sender enable booking finalization email;
- Google client ID and secret enable Calendar operations; and
- Tencent Meeting URL and token enable meeting operations.

An absent pair leaves that capability unavailable and its routes fail closed
with HTTP 503. A half-configured pair fails server-environment validation and
prevents deployment. There are no separate `AMA_*_ENABLED` runtime switches.
Removing an environment-scoped credential pair and redeploying is the emergency
provider shutdown path.

The credential gate does not replace request validation, same-origin mutation
checks, rate limits, owner authorization, provider signature verification, or
privacy-safe audit events.

## Consequences

- Environment inventories must evaluate complete credential pairs, not feature
  flags.
- Preview and Staging use only non-production provider credentials. Production
  credentials never enter those environments.
- Public database-only mutations remain available when provider credentials
  are absent, subject to their validation and rate-limit boundaries.
- Introducing an independent runtime switch again requires a new threat or
  operations case and a superseding decision.
