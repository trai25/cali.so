# v2 Handoff

Status snapshot for whoever (human or agent) picks this up. Last updated
July 2026, on the long-lived `v2` branch.

## Where things stand

Working and verified (light/dark/mobile, production build green):

- **Platform**: Next.js 16.3.0-preview.5, React 19, Tailwind v4, pnpm.
  shadcn (radix base, nova preset) + the `@fluid` registry in
  `components.json`. Fonts: Geist (Latin) + Frex Sans GB (CJK fallback,
  OFL) via `app/fonts.ts`.
- **Content layer** (`lib/content.ts`): fs + gray-matter + zod frontmatter,
  CJK-aware reading time, `next-mdx-remote` RSC + remark-gfm +
  rehype-pretty-code (shiki, `github-light/dark-default`). Post images are
  colocated in `content/blog/<slug>/` and served by
  `app/content/[...path]/route.ts`; markdown images carry dimensions as
  `./file.png#WxH` fragments.
- **All 9 posts ported** from the v1 archive; SSG via `generateStaticParams`.
  Tweets render via `<Tweet>` (`components/mdx/tweet.tsx`): fully static, no
  client embed — tweet data is archived as `./tweet-<id>.json` next to the
  post at port time (only `do-buttons-need-pointer-cursors` has one; the
  embedded video is represented by a marker + link out, not mirrored).
- **Design system foundations** per `docs/design-language.md` (the spec —
  read it before any UI work; also see AGENTS.md → apply the
  `emil-design-engineering` skill): paper grain + boxed drafting guides,
  PolaroidCover (pick-up hover physics, `--paper` token), focus-pull lists,
  motion/shadow tokens, one-size chrome typography, code blocks with copy
  buttons.
- **URL back-compat** (issue #75): all v1 redirects/rewrites live in
  `next.config.ts` since day one, verified against a running server.

## Work queue (rough order)

1. **`/feed.xml` route** — the `/rss`, `/feed`, `/rss.xml` rewrites currently
   404. Port semantics from v1 (`main` branch: `app/(main)/feed.xml/route.ts`).
2. **Sitemap + OG images** — OG must reuse the polaroid treatment
   (design-language: "recognizably the same object").
3. **Pages**: `/projects` (data as typed config, v1 content in the archive's
   `sanity-export/documents/project.json`), `/about`, `/ama` (port from
   `main`, it's fully static).
4. **Newsletters + admin + magic-link auth** (ADR-0004): subscribers/
   newsletters tables stay; Resend already in env. Single allowlisted email,
   15-min single-use token, rate-limited request, signed httpOnly ~30d
   session cookie.
5. **Hover cards** (design-language contract), **focus-pull → post
   transition** (staged title card), print-pile list thumbnails.
6. **Cutover checklist** (do NOT do early): crawl live v1 URLs and verify
   100% (issue #75 acceptance criteria); drop `comments`/`guestbook` tables
   (data already archived privately); decommission Sanity only after all
   content verified in prod; gate on Next 16.3 stable (ADR-0005).

## Gotchas

- **Worktree**: development happens in a git worktree nested inside the main
  checkout — `turbopack.root` is pinned in `next.config.ts`; don't remove it.
- **Env**: `.env.local` comes from `pnpm dlx vercel@latest link --yes --scope
  cali --project cali-so` then `env pull .env.local --environment=production`.
  Plain `vercel link --yes` creates a junk project named after the directory
  (one such project, `personal-site-v2-600117`, may still need deleting in
  the Vercel dashboard).
- **HugeIcons**: `@fluid` components deep-import `@hugeicons/core-free-icons`
  which ships no per-icon types — `types/hugeicons.d.ts` covers them.
- **Dev server**: `.claude/launch.json` defines `dev` on port 3199 for the
  Browser pane.
- **Design references are private.** Never name the visual-inspiration
  sources in this repo (commits, issues, docs, comments). The committed
  vocabulary in `docs/design-language.md` is the public form. (Claude:
  details are in private memory.)
- **Open design decisions**: handwriting/annotation face for polaroid
  captions and illustrations; accent color / warm-vs-neutral palette; dark
  mode toggle UI (next-themes is wired, system-follow only).

## Key documents

- `docs/adr/0001–0006` — why things are the way they are
- `docs/design-language.md` — the buildable UI spec
- `docs/agents/*` — issue tracker / triage / domain-docs conventions
- Issue #75 — URL back-compat ship gate
