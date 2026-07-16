# v3 handoff

Current as of July 2026.

## Release state

- The ground-up rewrite is **v3**. The site released in 2024 remains the
  historical v2.
- The integration branch keeps the name **`v2`** for continuity. `main` still
  drives production; merging the completed v3 release into `main` is the
  cutover.
- Release scope and evidence are tracked by
  [#98](https://github.com/CaliCastle/cali.so/issues/98). Do not merge to
  `main` until its complete dependency chain and final proof are green.
- Release slices #99 through #106 are merged into `v2`. Final cutover proof is
  tracked by #107; its checked-in report is the current readiness authority.

## Current architecture

- Next.js 16.3 preview, React 19, TypeScript, Tailwind CSS v4, Base UI, and the
  `@fluid` component registry. The Next.js version is exact-pinned.
- Posts are MDX under `content/blog/<slug>/`; assets are colocated and served
  through the owned content route. Projects and personal registries are typed
  source files.
- Chinese keeps every established unprefixed URL. English uses the matching
  `/en` route family. Locale-specific feeds, metadata, and OG images follow the
  route, not browser-local state.
- Public pages are static where possible. GitHub and YouTube social values use
  ISR-backed fetches with committed JSON snapshots as outage fallbacks.
- External-link cards keep metadata in a committed snapshot refreshed through
  `og.zolplay.com`; the same first-party service proxies fixed-slot favicons and
  Open Graph images, and missing media remains a non-blocking presentation
  failure.
- The fixed bottom dock is the primary navigation. The visual contract lives
  in `docs/design-language.md`.
- The owner admin is always reachable for Media and AMA operations, with
  Clerk authentication and an exact server-checked
  `publicMetadata.siteOwner = "yes"` authorization marker. Origin checks, rate
  limits, audit events, and the strict admin CSP remain in force. Public AMA
  mutations, payment, provider, and finalization capabilities stay disabled for
  the v3 production launch.
- Rate limits use Upstash only in Production. Preview persists its limits in
  the isolated Neon database, while Local and CI use process-local limits.
- Security baseline controls from PR #97 remain mandatory: CSP and security
  headers, same-origin mutation policy, rate limits, kill switches,
  privacy-safe audit events, isolated credentials, and security automation.
- The Bunny-backed Media Library in ADR-0007 owns the curated photo workflow.
  Private Originals stay server-only, while `/photos` and homepage previews
  consume the active Published Photo Selection from Bunny Renditions.

## Launch gates

1. Preserve every legacy public URL through native content, a static archive,
   or an intentional permanent replacement. Drive verification from one
   checked-in manifest, not spot checks.
2. Complete all three issue #91 stages: Cache Components baseline,
   route-by-route Instant Navigations, then Partial Prefetching and browser
   regression coverage.
3. Keep owner admin authenticated and reachable while unfinished public AMA,
   payment, provider, and finalization capabilities fail closed.
4. Validate from a frozen-lockfile install: types, all tests, migrations,
   localization, security, production build, dependency audit, links, HTTP
   contracts, and browser checks.
5. Review a production-like Vercel Preview across both languages, appearance
   modes, mobile and desktop, reduced motion, keyboard navigation, metadata,
   feeds, social images, and navigation shells.
6. Record hosted controls and production prerequisites as pass, fail, unknown,
   or awaiting confirmed access. Never count an unverified external state as
   passed.
7. Run separate repository-standards and release-spec reviews over the complete
   diff before proposing the `main` merge.

Production database or sensitive cloud-data access is not implied by release
work. It requires two fresh explicit confirmations immediately before access.

## Commands

```bash
pnpm install --frozen-lockfile
pnpm dev

pnpm typecheck
pnpm test:unit
pnpm test:localization
pnpm test:port-post
pnpm test:ama
pnpm test:security
pnpm test:media:storage
pnpm test:media:catalog
pnpm test:media:processing
pnpm test:media:ingestion
pnpm test:media:geocoding
pnpm test:media:alt-text
pnpm test:media:admin
pnpm test:media:asset-review
pnpm test:media:photo-selection
pnpm test:media:purge
pnpm test:media:reconciliation
pnpm db:validate
pnpm build
pnpm test:navigation
pnpm verify:legacy-urls
pnpm verify:links
pnpm verify:public-discovery
pnpm verify:security-boundary
pnpm audit:prod
```

Run migrations only with an explicitly supplied migration credential:

```bash
MIGRATION_DATABASE_URL=postgresql://... pnpm db:migrate
```

The Vercel runtime receives only the CRUD-only `DATABASE_URL`. Never put
`MIGRATION_DATABASE_URL` in Vercel or an ordinary runtime environment file.

## Gotchas

- Product generation and branch name differ: v3 is developed on `v2`. Do not
  rename historical tags, the integration branch, vendor APIs, or protocol
  versions while correcting product terminology.
- This Next.js preview has breaking changes. Read the relevant bundled guide in
  `node_modules/next/dist/docs/` before changing framework behavior.
- `turbopack.root` supports nested worktrees and must stay configured.
- OG font subsetting dynamically imports `subset-font` to keep HarfBuzz WASM
  out of Turbopack tracing. Preserve that boundary.
- Raw stylesheet `backdrop-filter` is stripped by the CSS pipeline. The liquid
  dock owns its SVG filter as an inline style; ordinary blur uses Tailwind
  utilities.
- Preview and Production credentials and data are separate. Preview data must
  be disposable or irreversibly sanitized. Never attach Redis credentials to
  Preview; its rate-limit windows live in the Preview Neon database.
- The five optional `AMA_*_ENABLED` variables fail closed. Leave every one
  `false` for the v3 launch; owner admin has no capability switch.
- Design references are private. Public code and documentation use only the
  vocabulary in `docs/design-language.md`.

## Post-launch work

- Complete the remaining passkey and recovery work in #93 without disabling
  owner admin, then resume the public AMA product slices (#82 through #87)
  behind their security and privacy gates.
- Revisit Bunny S3 preview constraints and provider capabilities before
  expanding the Media Library beyond the curated photo workflow.
- Re-enable private capabilities only after their provider, retention,
  incident-response, and hosted-control checks are complete.
