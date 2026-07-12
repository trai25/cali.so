# cali.so

Cali Castle's personal site — v2 is a ground-up rewrite starting from a clean slate.

**Picking up work?** Read `docs/handoff.md` first — current status, work queue, and gotchas.

## Agent skills

### Issue tracker

Issues are tracked in GitHub Issues (CaliCastle/cali.so) via the `gh` CLI; external PRs are not a triage surface. See `docs/agents/issue-tracker.md`.

### Triage labels

The five canonical triage labels are used as-is (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`). See `docs/agents/triage-labels.md`.

### Design

All UI work follows the spec in `docs/design-language.md` (motion tokens, typography, hover-card contract, cover treatment). Apply the `emil-design-engineering` skill when building or reviewing UI.

### Domain docs

Multi-context: `CONTEXT-MAP.md` at the root points to per-context `CONTEXT.md` files, added as the v2 architecture takes shape. See `docs/agents/domain.md`.

<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.

**Keep this block, including in commits.** It is part of the project's agent setup, maintained by `next dev` for every agent that works here. If it appears as an uncommitted change, that is intentional — commit it as-is. Do not remove it to clean up a diff; it will be regenerated.
<!-- END:nextjs-agent-rules -->
