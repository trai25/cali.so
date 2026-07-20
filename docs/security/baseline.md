# Public-repository security baseline

The repository is public. Source code, route names, and client-visible
configuration are not security boundaries. Controls must remain effective when
an attacker can read the implementation.

## Deployment and secret isolation

| Environment | Data and integrations | Secret policy |
| --- | --- | --- |
| Production | Production-only accounts and durable data | `main`-only GitHub environment; automatic after required pull-request checks and merge |
| Staging | Persistent non-production baseline and test accounts | Staging-scoped credentials; never production credentials |
| Preview | Disposable child of Staging for one internal Git branch | Preview-scoped runtime credentials; never production credentials |
| Local and CI | Local emulators, fixtures, or dedicated test accounts | Developer-local or CI-scoped credentials with the minimum privilege |

- Keep production and preview credentials in separate provider projects or
  accounts wherever the provider supports it. Never encode secrets in source,
  build output, client bundles, logs, issue text, or workflow files.
- Scope Vercel environment variables explicitly. A production secret must not
  be exposed to Preview or Development. Restrict Production credentials to the
  `main`-only GitHub environment; pull-request checks and branch protection are
  the human approval boundary before the automatic deployment.
- Forks and untrusted pull requests receive no sensitive credentials. Workflows
  triggered by pull requests must not use `pull_request_target` to execute
  contributor-controlled code.
- Give each integration a distinct credential and the narrowest scopes it
  supports. Rotate on suspected exposure and remove old credentials after a
  verified cutover.
- AMA capabilities follow ADR-0011: public mutations are available by default,
  while each provider-backed capability requires its complete
  environment-scoped credential pair. Missing pairs fail closed and half pairs
  fail deployment validation. Client-only flags are not controls.
- Owner admin is always reachable and has no environment switch. Every admin
  page, data read, and mutation must enforce Clerk authentication and require
  the authoritative user record to contain the exact public metadata marker
  `siteOwner: "yes"` close to its data source. Browser mutations additionally
  require same-origin requests and rate limits. Email addresses and client-side
  metadata copies never grant access.

## Database privilege separation

Production uses separate database identities:

- The runtime role receives only the schema usage and table or sequence
  privileges required for application CRUD. It cannot create or alter schema,
  manage roles, grant privileges, or run migrations.
- The migration role may perform approved DDL only in its scoped GitHub
  deployment step. It is never sent to Vercel, an application build or runtime,
  a browser, or ordinary code-validation CI.
- An owner or emergency role is break-glass only, access-controlled and
  audited. It is not an application credential.
- Staging and Preview use a separate non-production Neon project and
  credentials. Production snapshots are not copied into it unless they are
  irreversibly sanitized first. The non-production automation key has no access
  to the Production Neon project.

Review grants whenever the schema changes. Prefer explicit grants over broad
database ownership, require encrypted connections, and revoke default/public
privileges that are not needed. The migration role's default privileges must
grant the runtime role only the table and sequence access new application
objects require, so automatic migrations do not create owner-only tables.

## Logging and audit events

Application logs must not contain cookies, session or API tokens,
authorization headers, full email addresses, Booking Brief contents, payment
payloads, meeting credentials, raw provider payloads, or request/response
bodies that may carry those values. Redaction is a fallback, not permission to
log sensitive input.

Security events use a small allowlist by default:

- event type and timestamp;
- outcome or denial reason category;
- request ID or trace ID;
- pseudonymous actor, tenant, or resource identifier.

Do not derive pseudonymous identifiers with a public or reversible value. Keep
access to logs least-privileged, set retention deliberately, and audit access.
Authenticated admin denials and privileged actions should be auditable without
recording their sensitive payloads.

## Repository and CI controls

- Keep Actions' repository default at read-only. Each workflow declares its
  own minimum permissions; the CodeQL upload job is allowed only
  `security-events: write` in addition to `contents: read`.
- Database-backed deployment workflows run only for branches inside this
  repository. Fork pull requests receive code-only checks and never receive
  Neon or Vercel credentials.
- Pin every action to a verified full commit SHA and retain the release tag in
  a comment so updates remain reviewable.
- Require pull requests and required CI/security checks on the integration and
  production branches. Disable force pushes and branch deletion. Keep any
  emergency-admin bypass narrow, audited, and tested.
- Enable private vulnerability reporting, secret scanning, push protection,
  non-provider pattern scanning, validity checks, Dependabot alerts/security
  updates, and CodeQL in GitHub repository settings.
- Run a full-history secret scan before launch. Treat findings as exposed:
  rotate the credential first, then remove it from current code and, where
  appropriate, rewrite history through a separately approved process.

The public Production CSP keeps `script-src 'unsafe-inline'` because Next.js
static, ISR, and partial-prerendered output includes inline hydration payloads.
A per-request nonce would disable those rendering modes. Next.js SRI is enabled
for supported build assets, `unsafe-eval` is development-only, script
attributes are blocked, and all other directives remain restricted. The
partially prerendered `/admin` surface uses the same static script policy so its
Instant Navigation shells remain cacheable; it has no client-side Clerk
provider or provider-origin allowance. Inline styles remain allowed because
shared React UI emits style attributes. Revisit the script and shared style
exceptions when Next.js and the UI can remove them without giving up static
shells or functionality.

Configuration committed to this repository does not prove that a hosted
setting is enabled. Track hosted verification separately in
[verification.md](./verification.md).
