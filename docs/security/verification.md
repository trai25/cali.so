# Security verification

Last checked: 2026-07-15. This note separates repository evidence from hosted
settings. Do not paste credentials, scan findings, or exploit details into this
file; use GitHub private vulnerability reporting.

## Local repository

- [x] `SECURITY.md` directs coordinated disclosure to GitHub private
  vulnerability reporting.
- [x] `.github/dependabot.yml` covers pnpm/npm dependencies and GitHub Actions.
- [x] `.github/workflows/security.yml` runs the build, typecheck, AMA,
  migration, localization, disabled-boundary, and CodeQL checks on pull
  requests targeting any branch and on pushes to integration or production;
  CodeQL also runs on a schedule and manually.
- [x] Workflow actions are pinned to full, verified commit SHAs with release
  tag comments.
- [x] Workflow permissions default to read-only; only the CodeQL job adds the
  required `security-events: write` permission.
- [x] Gitleaks 8.30.1 scanned all reachable refs and 302 commits on
  2026-07-14 with redaction enabled; no findings were reported. Re-run before
  launch and rotate any real credential before discussing cleanup publicly.

Local recheck:

```sh
pnpm typecheck
pnpm test:ama
pnpm test:security
pnpm verify:security-boundary
git grep -nE 'uses: [^#[:space:]]+@(v|main|master|[0-9a-f]{1,39})([[:space:]]|$)' -- '.github/workflows/*.yml'
```

The `git grep` command should return no unpinned action references. Security
scan output must remain private.

## GitHub

Repository API checks on 2026-07-15 verified:

- [x] Private vulnerability reporting, secret scanning, push protection, and
  Dependabot security updates are enabled.
- [x] Default Actions workflow permissions are read-only and workflows cannot
  approve pull requests.
- [x] Actions must be pinned to a full commit SHA.
- [x] The `v2` ruleset requires pull requests, blocks force pushes and branch
  deletion, and limits emergency bypass to repository administrators so GitHub
  retains the audit trail. It currently requires no approval while the project
  has one maintainer.
- [x] CodeQL default setup remains disabled so the committed advanced workflow
  is the single analysis source.
- [ ] Add `Quality` and `CodeQL` as required `v2` checks after both check names
  have completed successfully at least once. The active ruleset currently has
  no required-status-check rule.
- [ ] Non-provider secret patterns and validity checks remain unavailable in
  the repository's current GitHub product mode. Recheck the setting before
  launch or after a plan change.
- [ ] Confirm Dependabot can open an update without repository or production
  credentials after this configuration reaches `v2`.

Recheck these settings through the GitHub Security and Actions settings pages
or with read-only `gh api` calls. Keep sensitive evidence in private
vulnerability reports rather than public issues or logs.

## Vercel

Project checks completed on 2026-07-14 and 2026-07-15 verified:

- [x] The production branch remains `main`, matching the documented plan to
  keep v1 live until the one-time v2 cutover.
- [x] Git fork protection is enabled.
- [x] Production and Preview use distinct database credentials.
- [x] Preview uses an isolated Neon branch and a pooled runtime credential. Its
  runtime role was exercised with CRUD-only access and no schema, database,
  role-management, RLS-bypass, replication, or Neon-admin privileges.
- [x] The Preview environment explicitly sets all six AMA capability switches
  to `false`.
- [x] The active `Admin Security` firewall rule challenges exactly
  `POST /api/admin/auth/request`.
- [ ] Provision isolated Development credentials before expecting that
  environment to exercise authenticated AMA or provider integrations.
- [ ] Verify the production runtime database role cannot perform DDL or role
  management, and keep `MIGRATION_DATABASE_URL` absent from Vercel.
- [ ] Verify logs and drains follow the allowlist in `baseline.md`, with
  deliberate access and retention.
- [ ] Configure the six kill switches explicitly in Development and Production;
  keep them false until the corresponding capability is approved for release.
