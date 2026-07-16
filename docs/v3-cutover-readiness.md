# v3 cutover readiness

Last checked: 2026-07-16 (hosted-control inventory refreshed the same day).

## Verdict

**NOT READY.** The merged `v2` integration branch is green under the complete
local release suite, the Standards vocabulary breach is resolved, and the
hosted-control inventory now has current evidence. The decisive blocker is
that the Production environment is not yet provisioned for v3: its runtime
database credential predates the rewrite and the v3 server-environment
contract — including every media provider value — is unmet. Required GitHub
checks, credential isolation, and the production database and media
verifications also remain open.

Unknown hosted state is not counted as passed. This report does not authorize
merging to `main`, changing production settings, accessing production data, or
running production migrations.

## Audit baseline

| Item | Value |
| --- | --- |
| Production branch | `main` at `8c258834af538dd501486a5fd319b3e96a2ff5bc` |
| Integration branch | `v2` at `12fb6df` (post `#136` and `#138`) |
| Vercel project | `cali-so` (`prj_oIl5MLjdm44QGv4v7ywZsPegtFoH`) on team `team_r1Mln12TRfgnkYJwXd62uJJ5` |
| Production deployment | `dpl_BV7cKxGmfTAa1tUr2SScR6p9Uco8`, created 2024-03-10, status Ready |
| Release issue | [#98](https://github.com/CaliCastle/cali.so/issues/98) |
| Readiness issue | [#107](https://github.com/CaliCastle/cali.so/issues/107) |
| Framework pin | `next@16.3.0-preview.6` |
| Install boundary | `pnpm install --frozen-lockfile` |
| Production site observed | `https://cali.so`, HTTP 200 from Vercel, still serving `main` |

Prerequisite issues #99 through #106 are closed and their changes are merged
into `v2`. The complete issue #96 Media Library stack is also merged: the
owner admin manages the catalog and curation workflow, and the public homepage
and `/photos` now consume the active Published Photo Selection from Bunny
Renditions. The retired static photo fallback has been removed.

## Gate summary

| Gate | Status | Evidence or blocker |
| --- | --- | --- |
| Frozen install | PASS | `pnpm install --frozen-lockfile` completed from the audited commit. |
| Repository validation | PASS | Every command and count in the automated evidence section passed. |
| Public browser behavior | PASS | Desktop, mobile, both locales, light and dark appearance, reduced motion, metadata, overflow, accessibility tree, and dock targets were reviewed locally. |
| Owner admin boundary | PASS | Admin login remains reachable without a feature flag; protected pages and APIs enforce owner authentication, same-origin mutations, rate limits, audit events, and the strict admin CSP. |
| Complete diff Standards review | PASS | Portal layering and admin typography findings were fixed. The Media `lifecycle` vocabulary breach was resolved by PR #138 (issue #134 closed): Catalog State is the glossary term, and additive migration `0009` renames the column. |
| Complete diff Spec review | PASS | No scope creep, incorrect PASS treatment, or missing local evidence was found; the unresolved hosted and production requirements below correctly keep the verdict at NOT READY. |
| Production-like PR Preview | AWAITING CONFIRMATION | The #107 PR is merged; review a current `v2` Preview across the full release matrix once Production provisioning lands, and record its URL here. |
| GitHub security settings | PASS | Secret scanning, push protection, Dependabot security updates, read-only Actions defaults, and full-SHA action policy are enabled. |
| Required GitHub checks | FAIL | Neither the `v2` ruleset nor `main` branch protection requires `Quality` and `CodeQL`. The maintainer-operated commands are in `docs/v3-cutover-ops-runbook.md`. |
| Current Vercel project settings | PASS | Project inspection succeeds with the explicit team scope. The earlier `Not authorized` was a CLI quirk: the team slug `cali` resolves to the personal account, so commands must pass `--scope=team_r1Mln12TRfgnkYJwXd62uJJ5`. |
| Production capability switches | PASS | All five optional `AMA_*_ENABLED` variables are absent from Production and therefore fail closed. Setting them explicitly `false` remains recommended during provisioning. `AMA_ADMIN_ENABLED` survives in Preview as dead configuration after ADR-0008 and should be removed. |
| Preview and Production secret isolation | FAIL | `RESEND_API_KEY` is one variable targeting both Production and Preview, and the `KV_*`/`REDIS_URL` group added with the Preview provisioning also targets both environments. |
| Production runtime environment | FAIL | Production `DATABASE_URL` predates the rewrite by over three years, and the v3 server-environment contract is otherwise unmet: no `SESSION_SECRET`, `AMA_ENCRYPTION_KEY`, `RATE_LIMIT_HASH_KEY`, `SITE_URL`, `RESEND_FROM_EMAIL`, rate-limit values, `CRON_SECRET`, or any `BUNNY_*`/`MEDIA_*` variable. The first v3 production build would fail environment validation. |
| Production runtime database grants | AWAITING CONFIRMATION | Requires two fresh confirmations before inspecting the production role or sensitive cloud state. |
| Production migration credential | PASS (name level) | `MIGRATION_DATABASE_URL` is absent from every Vercel environment. Its availability to the controlled migration operation is confirmed at cutover time. |
| Production migrations | AWAITING CONFIRMATION | Nine additive migrations validate locally. Media migrations `0005` through `0009` are required for the v3 photo surface; execution and schema state require a separately authorized cutover step. |
| Media provider and publication | FAIL | Production has no Bunny or media configuration at all, so the provider boundary, live storage contract, and the two-photo Published Photo Selection cannot exist yet. Provisioning precedes verification. |
| Other external providers | PASS (name level) | No Google, Tencent, payment, or booking-finalization credentials exist in Production. Legacy-era variables (Clerk, Sanity, Edge Config, a three-year-old Upstash pair) remain for the current `main` site and need pruning or rotation at cutover. |
| Logs and drains | UNKNOWN | Not exposed through the CLI; verify access, retention, drains, and the privacy allowlist in the Vercel dashboard. |
| Domain cutover | PASS (partial) | `cali.so` is assigned to the correct team with third-party DNS pointing at Vercel and the production alias intact. The production-branch mapping and certificate still need a dashboard check before merge. |
| Rollback | AWAITING CONFIRMATION | The last known-good production deployment is recorded in the audit baseline. An operator must still confirm promotion or merge-revert works without reversing additive migrations. |

## Automated evidence

The following passed from the frozen installation:

- TypeScript typecheck.
- 385 Vitest unit and integration tests across application, component, and
  library code, excluding only explicitly live provider suites.
- 125 AMA tests and 5 migration checks.
- 4 security tests.
- 148 localization checks.
- 19 Media Library catalog tests.
- 17 Media Library ingestion and privacy tests.
- 9 Media Library processing tests.
- 41 Media Library storage tests.
- 7 Media Library geocoding tests.
- 18 Media Library Alt Text tests.
- 26 Media Library admin tests.
- 12 Media Asset review tests.
- 27 Photo Selection publication tests.
- 8 Media Asset Purge tests.
- 11 Media reconciliation tests.
- 4 port-post tests.
- Production build with 85 generated pages using the CI placeholder
  environment and every optional AMA capability disabled.
- 7 Instant Navigation, keyboard, motion, and typography browser tests.
- 53 legacy URL probes against the production server.
- 354 internal links and 147 live external links across all 28 sitemap pages.
- Public discovery and failure-handling verification.
- Disabled production security-boundary verification.
- OSV audit of 621 production packages with no findings.
- Full-SHA GitHub Action reference check.
- Redacted Gitleaks 8.30.1 scan of the reachable history with no findings.
- `git diff --check origin/main`.

The content check exposed five trailing spaces in two historical MDX files.
They were removed without changing rendered content.

## Browser review

Local production-build review covered the homepage and a representative blog
post in Chinese and English at desktop and mobile widths. It also covered light
and dark appearance, reduced motion, page metadata, horizontal overflow, the
accessibility tree, and the dock's 44-pixel pointer targets.

The review found that the custom `scroll-fade*` class names collided with
generated Tailwind scroll utilities. The collision introduced scroll-driven
animations and `transition: all`, including with reduced motion enabled. The
classes are now named `viewport-edge-fade*`, and a focused regression test
keeps them outside Tailwind's scroll-utility namespace.

Local evidence filenames:

- `home-zh-desktop-light.png`
- `home-en-desktop-dark.png`
- `home-en-mobile-reduced.png`
- `post-zh-desktop-light.png`
- `post-en-mobile-reduced.png`
- `post-zh-scroll.png`
- `og-zh.png`
- `og-en.png`

Follow-up production-server checks confirmed the complete Preferences keyboard
path, theme selection, Escape dismissal and trigger-focus restoration, post
navigation, lightbox activation and focus restoration, and article-map
activation and dismissal. They also confirmed Chinese and English Projects and
Photos pages without horizontal overflow; valid nine-item Chinese and English
feeds; localized Chinese and English Open Graph images; and zero running
animations under reduced motion. A final design-contract pass also confirmed
stable selection weights and contrast, instant indicator geometry, 14-pixel
Tweet copy, the shared chrome tracking value, and the 300ms swift image reveal.
The PR Preview must repeat the release matrix against Vercel rather than
assuming the local result proves hosted behavior.

Final review artifacts after the accessibility corrections:

- `final-home-en-desktop.png`
- `final-preferences-en-desktop.png`
- `final-preferences-en-motion-fix.png`
- `final-home-en-mobile-reduced.png`

## Review disposition

- The missing public-link gate is closed by `pnpm verify:links` and its CI
  integration. Same-repository runs crawl every sitemap page, reject broken
  internal targets, and live-check external targets. A repeated 404 or 410 is
  a failure; transient provider or TLS failures remain visible as inconclusive
  rather than making repository release status depend on another service's
  uptime. The final run had no inconclusive targets.
- The keyboard-coverage gap is closed by the sixth Playwright test and by
  replacing the Preferences menu with the correct popover semantics. Shared
  controls now follow the 44-pixel target, 14-pixel chrome, reduced-motion,
  and motion-token contracts.
- The seventh Playwright test closes the remaining design-contract findings.
  Shared product controls now change selection and focus without decorative
  motion, keep selected and unselected labels at one weight, and preserve
  selected-label contrast. Scroll reveals and public chrome typography use the
  documented timing and type tokens.
- The Media Library is now part of the v3 launch surface. Owner routes cover
  ingestion, review, recovery, and Photo Selection curation; public routes read
  an immutable Published Photo Selection from Bunny Renditions. The six static
  photos and their code path were removed, so release evidence must verify the
  production catalog, provider boundary, and publication rather than relying
  on a repository fallback.
- The merged Media schema's `lifecycle` column conflicted with the Media
  glossary. Rewriting merged migration `0005` would have been unsafe, so PR
  #138 resolved [#134](https://github.com/CaliCastle/cali.so/issues/134) with
  additive migration `0009`, renaming the column and constraint to Catalog
  State and aligning the schema, repositories, admin surfaces, tests, and
  glossary. State transitions and publication behavior are unchanged, and the
  Standards breach is closed.
- The complete-diff Standards review also found arbitrary `z-50` portal layers
  and widened letter spacing in admin chrome. Those findings are fixed with
  the existing `--z-card` layer and the shared `-0.011em` chrome tracking.
- The complete-diff Spec review found no scope creep or incorrect PASS
  treatment. Its incomplete requirements are the same hosted and production
  blockers recorded in the gate table and remaining actions.
- Remaining type below 14 pixels is limited to the design language's explicit
  13-pixel code exception and text printed onto physical craft objects such as
  polaroids, record sleeves, book covers, and the illustrated envelope. It is
  object artwork rather than site chrome.
- The compact localized-text component name `T` is retained as an established
  JSX convention whose `zh` and `en` props make its role explicit. The small
  duplicated Google status mapping is retained inside the owner-only AMA
  surface; neither judgement finding is a cutover defect.

## Migration and provider boundary

Migrations `0001` through `0004` are additive AMA foundations. Migrations
`0005` through `0009` define the Media catalog, Photo Selection publication,
publication revisions, durable Purge progress, and the Catalog State rename.
Their checked-in snapshots and migration tests pass. Unlike the optional public AMA flows, the v3 public
photo surfaces require the Media migrations, production Bunny configuration,
and an active Published Photo Selection. Git remains authoritative for writing
and ordinary site content, but not for the curated photo wall.

Before cutover, an authorized operator must:

1. confirm the production runtime role has only the required CRUD grants;
2. confirm Vercel has no migration credential;
3. apply the separately approved pending Media migrations with the migration
   role, preserving the additive migration history;
4. verify private Originals, public Renditions, and the active Published Photo
   Selection against the production Bunny and Neon boundary;
5. leave all five optional AMA capability switches explicitly false; and
6. smoke-test the public site without exercising disabled AMA provider
   workflows.

Production database or sensitive cloud-data inspection requires two fresh,
explicit confirmations immediately before access.

## Domain and rollback expectations

The intended cutover is a reviewed merge from `v2` into `main`. Vercel should
then build `main` and retain `cali.so` and `www.cali.so` on the same project.
No manual DNS move is expected, but current project ownership, production
branch, aliases, certificate, and environment scopes must be verified first.

Rollback must prefer promoting the last known-good Vercel production deployment
or reverting the cutover merge. The nine additive database migrations should
remain in place during application rollback; destructive down migrations are
not part of the procedure. Record the known-good deployment identifier and an
operator before cutover.

## Remaining manual actions

The maintainer-operated commands for actions 1 through 4 are collected in
`docs/v3-cutover-ops-runbook.md`.

1. Provision the Production environment for the v3 contract: replace the
   legacy `DATABASE_URL` with the CRUD-only Neon runtime role and add the
   missing secrets, rate limits, capability switches, and complete Bunny and
   media configuration.
2. Split the shared `RESEND_API_KEY` and `KV_*`/`REDIS_URL` credentials so
   Preview and Production hold isolated values, and delete the dead
   `AMA_ADMIN_ENABLED` variable from Preview.
3. Add `Quality` and `CodeQL` as required checks to both `v2` and `main`.
4. In the Vercel dashboard, verify logs, drains, retention, firewall rules,
   the production-branch mapping, and the certificate.
5. With two fresh confirmations, verify production runtime database grants
   and migration state, then apply migrations `0001` through `0009` with the
   separately supplied migration credential.
6. Verify the production Bunny and Neon Media boundary, run the protected live
   storage contract, and publish the intended two-photo Published Photo
   Selection through the owner admin.
7. Review a production-like Vercel Preview across the remaining browser matrix
   and update this report with its URL and result.
8. Confirm the rollback procedure against the recorded known-good deployment.
9. Only after every blocker above is passed, approve the separately operated
   merge to `main` and production cutover.
