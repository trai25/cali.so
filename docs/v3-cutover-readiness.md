# v3 cutover readiness

Last checked: 2026-07-16.

## Verdict

**NOT READY.** The merged `v2` integration branch is green under the complete
local release suite, and the browser and standards reviews found and fixed the
remaining motion and typography regressions. The production cutover must still
wait for current Vercel evidence, production credential and database-role
confirmation, required GitHub checks, and a final review of this branch's
Vercel Preview.

Unknown hosted state is not counted as passed. This report does not authorize
merging to `main`, changing production settings, accessing production data, or
running production migrations.

## Audit baseline

| Item | Value |
| --- | --- |
| Production branch | `main` at `8c258834af538dd501486a5fd319b3e96a2ff5bc` |
| Integration branch | `v2` at `1fbaef5c4a8b7874786033a0538487c2b73fffe7` |
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
| Owner admin boundary | AWAITING CONFIRMATION | Local and CI checks prove direct Clerk sign-in redirects plus exact `publicMetadata.siteOwner = "yes"` authorization, same-origin mutations, rate limits, audit events, and strict admin CSP. Confirm the Clerk keys and owner metadata in the deployed environments. |
| Complete diff Standards review | FAIL | Portal layering and admin typography findings were fixed. The Media `lifecycle` vocabulary breach remains tracked in #134 and needs resolution or an explicit maintainer exception. |
| Complete diff Spec review | PASS | No scope creep, incorrect PASS treatment, or missing local evidence was found; the unresolved hosted and production requirements below correctly keep the verdict at NOT READY. |
| Production-like PR Preview | AWAITING CONFIRMATION | Review the public Preview created by the #107 PR after Vercel finishes. |
| GitHub security settings | PASS | Secret scanning, push protection, Dependabot security updates, read-only Actions defaults, and full-SHA action policy are enabled. |
| Required GitHub checks | FAIL | Neither the `v2` ruleset nor `main` branch protection requires `Quality` and `CodeQL`. Changing protection requires separate maintainer authorization. |
| Current Vercel project settings | UNKNOWN | The authenticated CLI user is `cali`, but project inspection returns `Not authorized`. Historical evidence cannot replace a current check. |
| Production capability switches | UNKNOWN | Confirm all five optional `AMA_*_ENABLED` values are explicitly `false` in Production. Owner admin has no capability switch. |
| Preview and Production secret isolation | UNKNOWN | Confirm Preview and Production use separate Clerk secret keys and other provider credentials; current Vercel state is inaccessible. |
| Production runtime database grants | AWAITING CONFIRMATION | Requires two fresh confirmations before inspecting the production role or sensitive cloud state. |
| Production migration credential | AWAITING CONFIRMATION | Confirm `MIGRATION_DATABASE_URL` is absent from Vercel and available only to the controlled migration operation. |
| Production migrations | AWAITING CONFIRMATION | Eight additive migrations validate locally. Media migrations `0005` through `0008` are required for the v3 photo surface; execution and schema state require a separately authorized cutover step. |
| Media provider and publication | AWAITING CONFIRMATION | Verify the production Bunny zones and CDN, private Original boundary, required Renditions, live storage contract evidence, and the active two-photo Published Photo Selection. |
| Other external providers | UNKNOWN | Google, Tencent, payment, booking finalization, and public AMA mutation capabilities must remain disabled. Confirm production credentials are absent or isolated. |
| Logs and drains | UNKNOWN | Verify access, retention, drains, and the privacy allowlist against the current Vercel project. |
| Domain cutover | UNKNOWN | `cali.so` currently serves `main`; verify the current Vercel project, production-branch mapping, aliases, and certificate before merge. |
| Rollback | AWAITING CONFIRMATION | Confirm an operator can promote the last known-good Vercel deployment or revert the cutover merge without reversing additive database migrations. |

## Automated evidence

The following passed from the frozen installation:

- TypeScript typecheck.
- 394 Vitest unit and integration tests across application, component, and
  library code, excluding only explicitly live provider suites.
- 112 AMA tests and 5 migration checks.
- 5 security tests.
- 148 localization checks.
- 19 Media Library catalog tests.
- 17 Media Library ingestion and privacy tests.
- 9 Media Library processing tests.
- 41 Media Library storage tests.
- 7 Media Library geocoding tests.
- 18 Media Library Alt Text tests.
- 27 Media Library admin tests.
- 12 Media Asset review tests.
- 27 Photo Selection publication tests.
- 8 Media Asset Purge tests.
- 11 Media reconciliation tests.
- 4 port-post tests.
- Production build with 83 generated pages using the CI placeholder
  environment and every optional AMA capability disabled.
- 7 Instant Navigation, keyboard, motion, and typography browser tests.
- 53 legacy URL probes against the production server.
- 354 internal links and 147 live external links across all 28 sitemap pages.
- Public discovery and failure-handling verification.
- Disabled production security-boundary verification.
- OSV audit of 626 production packages with no findings.
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
- The merged Media schema's `lifecycle` column conflicts with the Media
  glossary. Rewriting merged migration `0005` would be unsafe, so the additive
  vocabulary correction is tracked as post-launch issue
  [#134](https://github.com/CaliCastle/cali.so/issues/134). The implemented
  state transitions and publication behavior are unchanged, but this remains
  a documented Standards breach. The cutover cannot receive a READY verdict
  until the issue is resolved or the maintainer records an explicit exception.
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
`0005` through `0008` define the Media catalog, Photo Selection publication,
publication revisions, and durable Purge progress. Their checked-in snapshots
and migration tests pass. Unlike the optional public AMA flows, the v3 public
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
or reverting the cutover merge. The eight additive database migrations should
remain in place during application rollback; destructive down migrations are
not part of the procedure. Record the known-good deployment identifier and an
operator before cutover.

## Remaining manual actions

1. Restore authorized read access to the current Vercel project and re-run the
   hosted-control inventory without printing secret values.
2. Separate Preview and Production Resend credentials if the historical shared
   assignment still exists.
3. Confirm the five optional Production capability switches are explicitly
   false and owner admin remains protected by authentication.
4. With two fresh confirmations, verify production runtime database grants,
   migration-credential isolation, and migration state.
5. Verify the production Bunny and Neon Media boundary, run the protected live
   storage contract, and confirm the intended Published Photo Selection.
6. Resolve #134 or record an explicit maintainer exception for the Media
   vocabulary breach.
7. Verify Vercel logs, drains, access, retention, firewall rules, production
   branch, domains, and rollback deployment.
8. Add `Quality` and `CodeQL` as required checks to both `v2` and `main` after
   separate authorization.
9. Review the #107 Vercel Preview across the remaining browser matrix and
   update this report with its URL and result.
10. Wait for the #107 PR's Quality, CodeQL, Vercel, and Greptile checks and
    resolve any new finding or merge conflict.
11. Only after every blocker above is passed, approve the separately operated
    merge to `main` and production cutover.
