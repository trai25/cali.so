# v3 cutover ops runbook

Maintainer-operated commands for the hosted blockers in
`docs/v3-cutover-readiness.md`. Every step here changes production-adjacent
state and is intentionally left to a human operator. Nothing in this file
contains a secret; commands that need one prompt for it interactively.

## Vercel CLI scope

The team slug `cali` collides with the personal account, so slug-based scope
resolution returns `Not authorized`. Always pass the team ID:

```bash
SCOPE=--scope=team_r1Mln12TRfgnkYJwXd62uJJ5
npx vercel project inspect cali-so $SCOPE
```

## 1. Require Quality and CodeQL on both branches

The `v2` ruleset (`18920686`) has deletion, non-fast-forward, and PR rules but
no required checks; `main` classic protection has none. Add the rule to the
ruleset by round-tripping it:

```bash
gh api repos/CaliCastle/cali.so/rulesets/18920686 > /tmp/ruleset.json
jq '{name, target, enforcement, conditions, rules: (.rules + [{
  "type": "required_status_checks",
  "parameters": {
    "strict_required_status_checks_policy": false,
    "required_status_checks": [{"context": "Quality"}, {"context": "CodeQL"}]
  }
}])}' /tmp/ruleset.json > /tmp/ruleset-update.json
gh api -X PUT repos/CaliCastle/cali.so/rulesets/18920686 \
  --input /tmp/ruleset-update.json
```

Then protect `main` (PUT replaces the whole protection object; force pushes
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

## 2. Isolate Preview and Production credentials

- `RESEND_API_KEY` is a single variable targeting both environments. Create a
  second Resend key for Preview, then rescope: in the dashboard, edit the
  existing variable to Production only and add a Preview-only variable with
  the new key. CLI equivalent (each `env add` prompts for the value):

  ```bash
  npx vercel env rm RESEND_API_KEY preview $SCOPE
  npx vercel env add RESEND_API_KEY preview $SCOPE
  ```

- The `KV_URL`, `KV_REST_API_*`, and `REDIS_URL` group comes from one storage
  integration connected to both environments. Isolation happens in the
  dashboard's Storage tab: connect a separate store (or database) for Preview
  so Production traffic and Preview experiments never share data.

- Remove the dead capability switch left behind by ADR-0008:

  ```bash
  npx vercel env rm AMA_ADMIN_ENABLED preview $SCOPE
  ```

## 3. Provision the Production environment

Production currently satisfies none of the v3 contract in `.env.example`.
Each `env add` prompts for its value; generate fresh secrets rather than
copying Preview's, and never add `MIGRATION_DATABASE_URL` to any Vercel
environment.

```bash
add() { npx vercel env add "$1" production $SCOPE; }

# Runtime database: the CRUD-only Neon role, replacing the legacy value.
npx vercel env rm DATABASE_URL production $SCOPE
add DATABASE_URL

# Identity and delivery.
add SITE_URL                 # https://cali.so
add ADMIN_EMAIL
add RESEND_FROM_EMAIL
add CRON_SECRET              # openssl rand -hex 32

# Server-only key material — generate per environment, never reuse Preview's.
add SESSION_SECRET           # openssl rand -hex 32
add AMA_ENCRYPTION_KEY       # openssl rand -hex 32
add RATE_LIMIT_HASH_KEY      # openssl rand -hex 32
add MEDIA_ENCRYPTION_KEY     # openssl rand -hex 32

# Rate limits (values from .env.example defaults unless tuned).
add AUTH_RATE_LIMIT_MAX_REQUESTS
add AUTH_RATE_LIMIT_WINDOW_SECONDS
add ADMIN_MUTATION_RATE_LIMIT_MAX_REQUESTS
add ADMIN_MUTATION_RATE_LIMIT_WINDOW_SECONDS

# Capability switches — explicitly false for launch.
add AMA_PUBLIC_MUTATIONS_ENABLED
add AMA_PAYMENTS_ENABLED
add AMA_BOOKING_FINALIZATION_ENABLED
add AMA_GOOGLE_INTEGRATION_ENABLED
add AMA_TENCENT_INTEGRATION_ENABLED

# Bunny media storage (production zones, not the preview zones).
add BUNNY_MEDIA_REGION
add BUNNY_ORIGINALS_ZONE
add BUNNY_ORIGINALS_PASSWORD
add BUNNY_RENDITIONS_ZONE
add BUNNY_RENDITIONS_PASSWORD
add BUNNY_RENDITIONS_CDN_URL
add BUNNY_CDN_API_KEY

# Media enrichment — leave disabled until provider policy is approved.
add MEDIA_GEOCODING_ENABLED
add MEDIA_ALT_TEXT_ENABLED
```

The remaining `MEDIA_ALT_TEXT_*` and `BUNNY_STORAGE_CONTRACT_*` values are
needed only when Alt Text generation and the live storage contract are turned
on; consult `.env.example` and `docs/media/ai-provider-policy.md` first.

## 4. Dashboard-only checks

The CLI does not expose these; verify in the Vercel dashboard and record the
results in the readiness report:

- Log access, retention, and any drains against the privacy allowlist.
- Firewall and Attack Challenge configuration.
- Git production-branch mapping (`main`) and the `cali.so` certificate.

## 5. Production database and migrations

Gated by two fresh explicit confirmations immediately before access. Verify
the runtime role has only CRUD grants, then apply the nine additive
migrations with the separately held credential:

```bash
MIGRATION_DATABASE_URL=postgresql://... pnpm db:migrate
```

## 6. Rollback anchor

The last known-good production deployment is
`dpl_BV7cKxGmfTAa1tUr2SScR6p9Uco8` (2024-03-10, Ready). Rollback prefers
promoting it or reverting the cutover merge; additive migrations stay in
place:

```bash
npx vercel promote dpl_BV7cKxGmfTAa1tUr2SScR6p9Uco8 $SCOPE
```
