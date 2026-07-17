# v3 cutover ops runbook

Maintainer-operated commands for the hosted blockers in
`docs/v3-cutover-readiness.md`. Every step here changes production-adjacent
state and is intentionally left to a human operator. Nothing in this file
contains a secret; commands that need one prompt for it interactively.

## Vercel CLI scope

The team slug `cali` collides with the personal account, so slug-based scope
resolution returns `Not authorized`. Always pass the team ID, read from the
local link state so the ID itself stays out of the public repo:

```bash
SCOPE=--scope=$(jq -r .orgId .vercel/project.json)
npx vercel project inspect cali-so $SCOPE
```

If the repo is not yet linked, run `npx vercel link` once and pick the team
and the `cali-so` project.

## 1. Activate the controlled deployment topology

These hosted changes are shared state. Obtain an action-time confirmation
before the Git branch rename, and two fresh confirmations before inspecting or
changing either Neon project.

1. Rename the Git integration branch from `v2` to `dev` through GitHub's branch
   rename operation. Do not create a second unrelated branch or delete `v2`
   manually. Verify open pull requests, local tracking branches, and the
   existing ruleset now target `dev`.
2. In the non-production Neon project, rename the persistent `preview` branch
   to `staging`. Preserve its data, migration history, migration role, and
   SQL-created CRUD-only runtime role. Configure the migration role's default
   privileges so new tables and sequences grant only the required CRUD and
   sequence access to the runtime role; grant the same access explicitly on
   existing objects. The runtime role must not own objects or inherit DDL.
   Set Staging as the parent for disposable `preview/<git-branch>` branches so
   those roles and grants are copied into every Preview.
3. Keep Production in a separate Neon project. Its API key and migration URL
   must never be stored in the Preview or Staging GitHub environments.
4. Create a Vercel custom environment named `staging`. Set `SITE_URL` to its
   stable custom alias (currently `https://beta.cali.so`) so browser mutation
   checks match the URL maintainers use. Copy only approved non-production
   application settings into it; database URLs are supplied per deployment by
   GitHub Actions.
5. Create these GitHub deployment environments:

| Environment | Variables | Secrets | Protection |
| --- | --- | --- | --- |
| `preview` | `NEON_PROJECT_ID`, `NEON_MIGRATION_ROLE`, `NEON_RUNTIME_ROLE`, `NEON_DATABASE`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID` | project-scoped `NEON_API_KEY`, `VERCEL_TOKEN` | Internal branches only; exclude `dev` and `main` |
| `staging` | Same non-production variables | Same non-production secrets | `dev` only; no approval |
| `production-migration-review` | None | None | `main` only; required reviewer |
| `production` | `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID` | `MIGRATION_DATABASE_URL`, `VERCEL_TOKEN` | `main` only; required reviewer |

The committed `vercel.json` disables Vercel Git deployments. Do not re-enable
them in the dashboard: GitHub must create or select the Neon branch, migrate it,
and only then call Vercel. Configure the hosted environments and rename the
branch before merging this automation change into `dev`. That merge is the
first Staging workflow run and applies all pending migrations, including
`0010` and `0011`, before deploying. Use GitHub's job rerun for a failed
activation; the manual Staging dispatch becomes available after the workflow
reaches the default branch.

Verify the unified `/admin/media` workflow on Staging after the workflow is
green, including that `/admin/photos` redirects to `/admin/media#publish`.
Feature pushes should create `preview/<git-branch>` once, preserve it across
subsequent pushes, and delete both Neon and Vercel Preview resources when the
Git branch is deleted. `Refresh Preview` is the explicit destructive reset path.
All three operations share one per-branch concurrency lock. Refresh checks out
the trusted deployment action from `dev` and runs the requested branch only
from the isolated `target/` working directory.

## 2. Require Quality and CodeQL on both branches

The historical `v2` ruleset (`18920686`) already requires `Quality` and
`CodeQL` alongside its deletion, non-fast-forward, and pull-request rules.
After the branch rename, inspect the ruleset and verify its ref condition now
targets `dev`; do not append a duplicate required-check rule.

Protect `main` as well (PUT replaces the whole protection object; force pushes
and deletions stay disabled by default):

```bash
gh api -X PUT repos/CaliCastle/cali.so/branches/main/protection --input - <<'JSON'
{
  "required_status_checks": { "strict": false, "contexts": ["Quality", "CodeQL"] },
  "enforce_admins": false,
  "required_pull_request_reviews": null,
  "restrictions": null
}
JSON
```

## 3. Isolate Staging, Preview, and Production credentials

- AMA provider capabilities follow complete credential pairs and fail closed
  while a pair is absent. Use non-production Google, Stripe, Resend, and Tencent
  credentials in Preview and Staging when those flows need hosted testing;
  never copy their Production credentials into non-production environments.

- Redis is Production-only. In the dashboard's Storage tab, change the
  existing Upstash integration to target Production only, or remove the
  integration and reconnect it for Production only. Delete every `KV_*`,
  `REDIS_URL`, and `UPSTASH_*` variable from Preview. Do not create a Preview
  Redis store: Staging and Preview rate limits use their isolated Neon
  branches.

- The first successful Staging workflow applies migrations `0010` and `0011`
  with the separately scoped GitHub migration role before deployment. Verify
  the Staging runtime role has only required CRUD access to
  `rate_limit_windows` and the AMA booking tables; it must not own tables or
  receive DDL privileges.
  Staging and Preview have no Redis fallback: if the table or grants are missing,
  rate-limited admin mutations fail closed with 503. Because the Redis
  variables are already absent, do not count mutation checks as passed
  until this migration and grant verification succeeds.

- Add a Preview-only `CLERK_SECRET_KEY` from the non-production Clerk
  environment. Never copy the Production Clerk secret into Preview.

- Remove the dead capability switch left behind by ADR-0008:

  ```bash
  npx vercel env rm AMA_ADMIN_ENABLED preview $SCOPE
  ```

## 4. Provision the Production environment

Production currently satisfies none of the v3 contract in `.env.example`.
Each `env add` prompts for its value; generate fresh secrets rather than
copying Preview's, and never add `MIGRATION_DATABASE_URL` to any Vercel
environment.

```bash
add() { npx vercel env add "$1" production $SCOPE; }

# Runtime database: the CRUD-only Neon role, replacing the legacy value.
npx vercel env rm DATABASE_URL production $SCOPE
add DATABASE_URL

# Identity and runtime ownership.
add SITE_URL                 # https://cali.so
add ADMIN_EMAIL
add NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
add CLERK_SECRET_KEY
add CRON_SECRET              # openssl rand -hex 32

# Server-only key material — generate per environment, never reuse Preview's.
add AMA_ENCRYPTION_KEY       # openssl rand -hex 32
add RATE_LIMIT_HASH_KEY      # openssl rand -hex 32
add MEDIA_ENCRYPTION_KEY     # openssl rand -hex 32

# Rate limits (values from .env.example defaults unless tuned).
add ADMIN_MUTATION_RATE_LIMIT_MAX_REQUESTS
add ADMIN_MUTATION_RATE_LIMIT_WINDOW_SECONDS
add AMA_PUBLIC_RATE_LIMIT_MAX_REQUESTS
add AMA_PUBLIC_RATE_LIMIT_WINDOW_SECONDS

# Redis rate-limit backend: Production only. A Vercel Marketplace integration
# may inject KV_REST_API_URL and KV_REST_API_TOKEN instead; configure one
# complete credential pair, never both pairs and never any pair in Preview.
add UPSTASH_REDIS_REST_URL
add UPSTASH_REDIS_REST_TOKEN

# AMA provider capabilities use complete credential pairs and fail closed while
# absent. Configure only the providers intended for the Production launch.
add GOOGLE_CLIENT_ID
add GOOGLE_CLIENT_SECRET
add STRIPE_SECRET_KEY
add STRIPE_WEBHOOK_SECRET
add RESEND_API_KEY
add AMA_EMAIL_FROM
add TENCENT_MEETING_MCP_URL
add TENCENT_MEETING_MCP_TOKEN

# Bunny media storage (production zones, not the preview zones).
add BUNNY_MEDIA_REGION
add BUNNY_ORIGINALS_ZONE
add BUNNY_ORIGINALS_PASSWORD
add BUNNY_RENDITIONS_ZONE
add BUNNY_RENDITIONS_PASSWORD
add BUNNY_RENDITIONS_CDN_URL
add BUNNY_CDN_API_KEY

# Media enrichment. Both capabilities are enabled by default.
add GOOGLE_MAPS_GEOCODING_API_KEY
add MEDIA_ALT_TEXT_PRIMARY_MODEL
add MEDIA_ALT_TEXT_FALLBACK_MODEL
add MEDIA_ALT_TEXT_TIMEOUT_MS
add MEDIA_ALT_TEXT_MAX_RETRIES
add MEDIA_ALT_TEXT_RATE_LIMIT_MAX_REQUESTS
add MEDIA_ALT_TEXT_RATE_LIMIT_WINDOW_SECONDS
```

The `BUNNY_STORAGE_CONTRACT_*` values are needed only for the live storage
contract; consult `.env.example` and `docs/media/ai-provider-policy.md` first.

## 5. Dashboard-only checks

The CLI does not expose these; verify in the Vercel dashboard and record the
results in the readiness report:

- Log access, retention, and any drains against the privacy allowlist.
- Firewall and Attack Challenge configuration.
- Git production-branch mapping (`main`) and the `cali.so` certificate.

## 6. Production database and migrations

Gated by two fresh explicit confirmations immediately before access. Verify
the separate Production Neon project, CRUD-only runtime role, and migration-role
default privileges for both existing and future tables and sequences. A merge
to `main` then starts `Deploy Production`. The no-secret
`production-migration-review` environment records the first approval. Only
after it succeeds can the separately protected `production` environment expose
the migration credential and record the second approval.

The workflow hash-locks reviewed migrations `0001` through `0011` and rejects
any modification or deletion. Future migrations fail closed unless every SQL
statement is an explicitly allowed expand operation: create a new table, type,
sequence, view, function, or non-unique index; add a nullable column; add a
non-null column with a statically proven non-null default; validate a named
constraint; or set a statically proven non-null column default. New constraints,
including `NOT VALID` constraints, affect new writes and therefore require an
explicitly reviewed digest exception. Dynamic blocks, unknown default
expressions, and every unrecognized statement are rejected. After both
approvals and that check, the workflow applies pending migrations with the
GitHub-only credential and deploys the exact commit. Do not approve either
environment until the migration diff and rollback anchor have been reviewed.

## 7. Rollback anchor

The last known-good production deployment is recorded in the readiness
report's audit baseline. Deployments can age out of plan retention, so
resolve and verify the current one immediately before cutover and re-record
the ID:

```bash
DPL=$(npx vercel ls cali-so --prod $SCOPE \
  | grep -m1 -oE 'https://[a-z0-9-]+\.vercel\.app')
if [ -z "$DPL" ]; then
  echo 'ERROR: no production deployment resolved — STOP; do not run inspect or promote' >&2
else
  npx vercel inspect "$DPL" $SCOPE
fi
```

Only continue past this point when the inspect output shows the expected
deployment with `target production` and `status Ready`.

Rollback prefers promoting that verified deployment or reverting the cutover
merge; additive migrations stay in place:

```bash
npx vercel promote "$DPL" $SCOPE
```
