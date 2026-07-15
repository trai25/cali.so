# v3 cutover readiness

Last checked: 2026-07-15.

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
| Integration branch | `v2` at `3097a4926582e884d080aa24a2c5347b7b7cdbc3` |
| Release issue | [#98](https://github.com/CaliCastle/cali.so/issues/98) |
| Readiness issue | [#107](https://github.com/CaliCastle/cali.so/issues/107) |
| Framework pin | `next@16.3.0-preview.6` |
| Install boundary | `pnpm install --frozen-lockfile` |
| Production site observed | `https://cali.so`, HTTP 200 from Vercel, still serving `main` |

Prerequisite issues #99 through #106 are closed and their changes are merged
into `v2`. Media Library foundation changes merged afterward remain unreachable
and are not part of the v3 launch surface.

## Gate summary

| Gate | Status | Evidence or blocker |
| --- | --- | --- |
| Frozen install | PASS | `pnpm install --frozen-lockfile` completed from the audited commit. |
| Repository validation | PASS | Every command and count in the automated evidence section passed. |
| Public browser behavior | PASS | Desktop, mobile, both locales, light and dark appearance, reduced motion, metadata, overflow, accessibility tree, and dock targets were reviewed locally. |
| Production-like PR Preview | AWAITING CONFIRMATION | Review the public Preview created by the #107 PR after Vercel finishes. |
| GitHub security settings | PASS | Secret scanning, push protection, Dependabot security updates, read-only Actions defaults, and full-SHA action policy are enabled. |
| Required GitHub checks | FAIL | Neither the `v2` ruleset nor `main` branch protection requires `Quality` and `CodeQL`. Changing protection requires separate maintainer authorization. |
| Current Vercel project settings | UNKNOWN | The authenticated CLI user is `cali`, but project inspection returns `Not authorized`. Historical evidence cannot replace a current check. |
| Production capability switches | UNKNOWN | Confirm all six `AMA_*_ENABLED` values are explicitly `false` in Production. |
| Preview and Production secret isolation | UNKNOWN | The last verified state shared one Resend key across environments; current Vercel state is inaccessible. |
| Production runtime database grants | AWAITING CONFIRMATION | Requires two fresh confirmations before inspecting the production role or sensitive cloud state. |
| Production migration credential | AWAITING CONFIRMATION | Confirm `MIGRATION_DATABASE_URL` is absent from Vercel and available only to the controlled migration operation. |
| Production migrations | AWAITING CONFIRMATION | Five additive migrations validate locally; execution and schema state require a separately authorized cutover step. |
| External providers | UNKNOWN | Google, Tencent, payment, booking finalization, and public mutation capabilities must remain disabled. Confirm production credentials are absent or isolated. |
| Logs and drains | UNKNOWN | Verify access, retention, drains, and the privacy allowlist against the current Vercel project. |
| Domain cutover | UNKNOWN | `cali.so` currently serves `main`; verify the current Vercel project, production-branch mapping, aliases, and certificate before merge. |
| Rollback | AWAITING CONFIRMATION | Confirm an operator can promote the last known-good Vercel deployment or revert the cutover merge without reversing additive database migrations. |

## Automated evidence

The following passed from the frozen installation:

- TypeScript typecheck.
- 274 Vitest unit and integration tests across application, component, and
  library code, excluding only explicitly live provider suites.
- 125 AMA tests and 5 migration checks.
- 3 security tests.
- 148 localization checks.
- 19 Media Library catalog tests.
- 17 Media Library ingestion and privacy tests.
- 9 Media Library processing tests.
- 40 Media Library storage tests.
- 4 port-post tests.
- Production build with 78 generated pages.
- 7 Instant Navigation, keyboard, motion, and typography browser tests.
- 53 legacy URL probes against the production server.
- 354 internal links and 147 live external links across all 28 sitemap pages.
- Public discovery and failure-handling verification.
- Disabled production security-boundary verification.
- OSV audit of 613 production packages with no findings.
- Full-SHA GitHub Action reference check.
- Redacted Gitleaks 8.30.1 scan across 363 commits with no findings.
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
- Media Library storage, catalog, processing, and ingestion foundations were
  explicitly merged into `v2` by the maintainer after the original launch
  scope was written. They remain unreachable, do not replace static public
  media, and are not being presented as a shipped v3 feature. Migration `0005`
  must not run solely for this public cutover.
- The merged Media schema's `lifecycle` column conflicts with the Media
  glossary. Rewriting merged migration `0005` would be unsafe, so the additive
  vocabulary correction is tracked as post-launch issue
  [#134](https://github.com/CaliCastle/cali.so/issues/134). It does not affect
  the unreachable launch surface.
- Remaining type below 14 pixels is limited to the design language's explicit
  13-pixel code exception and text printed onto physical craft objects such as
  polaroids, record sleeves, book covers, and the illustrated envelope. It is
  object artwork rather than site chrome.
- The compact localized-text component name `T` is retained as an established
  JSX convention whose `zh` and `en` props make its role explicit. The small
  duplicated Google status mapping is retained inside the disabled owner-only
  AMA surface; neither judgement finding is a cutover defect.

## Migration and provider boundary

Migrations `0001` through `0004` are additive AMA foundations. Migration `0005`
is the unreachable post-launch Media Library catalog. Their checked-in
snapshots and migration tests pass, but the v3 public site requires none of
these private capabilities or tables. Static repository content remains
authoritative at launch, and no migration should run solely for the public
cutover.

Before cutover, an authorized operator must:

1. confirm the production runtime role has only the required CRUD grants;
2. confirm Vercel has no migration credential;
3. apply only separately approved pending migrations with the migration role;
   do not apply `0005` merely to launch the public site;
4. leave all six capability switches explicitly false; and
5. smoke-test the public site without exercising disabled provider workflows.

Production database or sensitive cloud-data inspection requires two fresh,
explicit confirmations immediately before access.

## Domain and rollback expectations

The intended cutover is a reviewed merge from `v2` into `main`. Vercel should
then build `main` and retain `cali.so` and `www.cali.so` on the same project.
No manual DNS move is expected, but current project ownership, production
branch, aliases, certificate, and environment scopes must be verified first.

Rollback must prefer promoting the last known-good Vercel production deployment
or reverting the cutover merge. The five additive database migrations should
remain in place during application rollback; destructive down migrations are
not part of the procedure. Record the known-good deployment identifier and an
operator before cutover.

## Remaining manual actions

1. Restore authorized read access to the current Vercel project and re-run the
   hosted-control inventory without printing secret values.
2. Separate Preview and Production Resend credentials if the historical shared
   assignment still exists.
3. Confirm the six Production capability switches are explicitly false.
4. With two fresh confirmations, verify production runtime database grants,
   migration-credential isolation, and migration state.
5. Verify Vercel logs, drains, access, retention, firewall rules, production
   branch, domains, and rollback deployment.
6. Add `Quality` and `CodeQL` as required checks to both `v2` and `main` after
   separate authorization.
7. Review the #107 Vercel Preview across the remaining browser matrix and
   update this report with its URL and result.
8. Obtain separate Standards and Spec reviews over `git diff origin/main...HEAD` and
   resolve every finding.
9. Re-run the complete release suite on the final #107 commit.
10. Only after every blocker above is passed, approve the separately operated
    merge to `main` and production cutover.
