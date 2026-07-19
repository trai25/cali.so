# Security verification

Last checked: 2026-07-20. This note separates repository evidence from hosted
settings. Do not paste credentials, scan findings, or exploit details here;
use GitHub private vulnerability reporting.

Owner admin is an always-available control plane for Media and AMA operations.
It has no environment kill switch: Clerk authentication plus the exact
server-checked `publicMetadata.siteOwner = "yes"` marker protects access. AMA
has no capability switches: provider-backed capabilities require complete
credential pairs and fail closed while their pair is absent.

## Local repository

- [x] `SECURITY.md` directs coordinated disclosure to GitHub private
  vulnerability reporting.
- [x] Dependabot covers pnpm/npm dependencies and GitHub Actions.
- [x] `.github/workflows/security.yml` runs Quality and advanced CodeQL for
  pull requests, `dev`, `main`, and the weekly schedule.
- [x] Deployment contract tests verify migration-before-deploy ordering,
  expand-only Production migrations, fork isolation, reserved-branch cleanup,
  and the absence of migration credentials from Vercel steps.
- [x] Workflow permissions default to read-only. Only CodeQL adds
  `security-events: write`.
- [x] Third-party Actions are pinned to full reviewed commit SHAs.
- [x] Gitleaks 8.30.1 scanned all 402 commits reachable from local branches
  and tags with redaction enabled. The only match was Clerk's public
  publishable key in the CI fixture; its exact fingerprint is documented in
  `.gitleaksignore`. The repeat scan reported no leaks.
- [x] Application security tests cover CSP and headers, same-origin mutation
  policy, route limits, fail-closed AMA capabilities, privacy-safe audit
  events, and the owner-admin boundary.

Local recheck:

```sh
pnpm typecheck
pnpm test:unit
pnpm test:ama
pnpm test:deployment
pnpm test:security
pnpm audit:prod
pnpm verify:security-boundary
gitleaks git --redact --no-banner --log-opts='--branches --tags' --verbose
git grep -nE 'uses: [^#[:space:]]+@(v|main|master|[0-9a-f]{1,39})([[:space:]]|$)' -- '.github/workflows/*.yml' '.github/actions/*/*.yml'
```

The production dependency audit queries OSV from the installed pnpm graph.
Public CI reports only the finding count; re-run privately with
`AUDIT_DETAILS=true` for package and advisory identifiers. Security scan output
must remain private.

## GitHub

Repository API checks refreshed on 2026-07-20 verified:

- [x] Private vulnerability reporting, secret scanning, push protection, and
  Dependabot security updates are enabled.
- [x] Default Actions workflow permissions are read-only and workflows cannot
  approve pull requests.
- [x] Actions must be pinned to a full commit SHA.
- [x] The `dev` and `main` rulesets require pull requests, block force pushes
  and branch deletion, and require the successful GitHub Actions checks named
  `Quality` and `CodeQL`.
- [x] Neither protected branch has a bypass actor. Branch protection and
  required checks are the human approval boundary before automatic Production
  deployment.
- [x] CodeQL default setup is disabled so the committed advanced workflow is
  the single analysis source.
- [ ] Non-provider secret patterns and validity checks are unavailable in the
  repository's current GitHub product mode. Recheck after a product or plan
  change.
- [x] Fork pull requests cannot receive Vercel secrets, and the GitHub Actions
  workflow uses committed non-secret fixtures instead of repository secrets.
- [x] Configure `preview`, `staging`, and `production` GitHub environments with
  the variables, secrets, and branch restrictions documented in the cutover
  runbook. Production runs automatically after required checks pass and a
  reviewed commit reaches `main`; it has no deployment reviewer.

## Vercel

Project API checks refreshed on 2026-07-20 verified:

- [x] `cali-so` is accessible in the `Cali` Pro workspace. Its production
  branch remains `main`, and Git fork protection is enabled.
- [x] Production and Preview have distinct database variables. Preview uses a
  disposable Neon branch and a pooled CRUD-only runtime role; migrations use a
  separate direct credential that is absent from Vercel.
- [x] The persistent non-production Neon branch is `staging`, the custom Vercel
  Staging environment is configured, and feature branches receive isolated
  `preview/<git-branch>` children.
- [x] Committed Vercel configuration disables Git deployments; hosted proof
  requires a GitHub-controlled Staging and Preview deployment after setup.
- [x] The former AMA capability switches are absent. Owner admin remains
  protected by Clerk plus the exact server-side `siteOwner: "yes"` marker;
  provider-backed capabilities follow complete environment-specific credential
  pairs and fail closed while absent.
- [x] Preview uses an isolated non-production Clerk instance. A normal-browser
  request to `/admin` reaches its sign-in UI, while direct non-browser requests
  remain fail closed.
- [ ] Configure an isolated Preview Resend credential pair only when hosted AMA
  finalization and transactional email testing is required.
- [ ] Apply migration `0010` to the Preview Neon branch and grant its runtime
  role CRUD-only access to `rate_limit_windows`. This remote database check
  requires two fresh confirmations. Preview unconditionally selects the
  database limiter and has no Redis fallback; if the table or grants are
  missing, protected admin mutations fail closed with 503.
- [x] Every `KV_*`, `REDIS_URL`, and `UPSTASH_*` variable is absent from
  Preview. Redis is Production-only. The Preview runtime is configured to use
  isolated Neon, but its migration and grants are not yet counted as verified.
- [ ] Remove the obsolete `Admin Security` challenge for the removed
  `POST /api/admin/auth/request` route.
- [x] The dead `AMA_ADMIN_ENABLED` Preview variable is absent; the owner admin
  boundary is not environment-gated.
- [x] Vercel reports no configured log drains for the workspace. A grouped,
  payload-free Preview query confirmed runtime-log access. The Pro workspace
  has Observability Plus enabled for this project, so Vercel's documented
  runtime-log retention is 30 days with a maximum 14-day query window.
- [x] Production uses separate `cali_migrator` and `cali_runtime` identities.
  GitHub stores the direct migration credential only in its `main`-restricted
  Production environment; Vercel stores only the pooled CRUD runtime URL. The
  runtime role cannot create schema, and the migration role cannot manage roles
  or databases.
- [x] Attempt 3 of
  [Deploy Production run #29707454879](https://github.com/CaliCastle/cali.so/actions/runs/29707454879)
  passed the expand-only policy, applied migrations `0001` through `0012`, and
  deployed the exact `main@d891463` commit automatically. Post-deploy checks
  verified the public security boundary, all 13 hosted browser cases, and a
  signed-out `401` from `/api/admin/media/assets` rather than a server error.

Clerk provider configuration and owner recovery remain tracked by issue #93.
Signed-in owner operations and end-to-end checks for each configured external
provider remain separate operational follow-ups; they are not deployment
workflow blockers.
