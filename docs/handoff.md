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
- **`/feed.xml`** (`app/feed.xml/route.ts`): v1 semantics (rss package,
  zh-CN, cover enclosures) but fully static — `force-static`, regenerates
  per deploy. `/feed`, `/rss`, `/rss.xml` rewrites verified. Site constants
  live in `lib/seo.ts`; `metadataBase` is wired in the root layout.
- **Sitemap + OG images**: `app/sitemap.ts` (home + /blog + posts, all
  static); per-post OG (`app/blog/[slug]/opengraph-image.tsx`) renders the
  polaroid treatment (slug tilt, paper frame, date caption) beside the
  title on the drafting-sheet background; site-wide OG + feed `image_url`
  wired. Shared satori JSX + tokens in `lib/og.tsx`; slug tilt extracted to
  `lib/polaroid.ts`. Fonts: Frex Sans GB subset per image at build via
  subset-font, loaded through `import(/* turbopackIgnore: true */ ...)` —
  bundling or tracing it crashes Turbopack on harfbuzz's wasm
  (NftJsonAsset error) and `serverExternalPackages` does not help, so
  don't "simplify" that import.
- **Character & motion pass** (July 2026, per Cali's direction — spec
  amended accordingly):
  - Theme tri-toggle (light/system/dark, system default) in the footer.
  - Tweet cards restyled as real tweets (avatar slot, X glyph); drop a
    `tweet-<id>-avatar.jpg` next to the snapshot to replace the initial.
  - Image lightbox (`components/zoom-image.tsx`) on all post images.
  - External links: inline favicons (Google s2 at view time) + preview
    hover cards from `content/link-previews.json`
    (`scripts/refresh-link-previews.mjs` rebuilds it).
  - View transitions (`experimental.viewTransition` + `<ViewTransition>`
    in the root layout — both required): cover + title morph between
    index and post; root defocus/focus. Verified via
    `document.getAnimations()` mid-navigation.
  - Entrance choreography + scroll reveal (`components/reveal-scope.tsx`);
    the old "no scroll animation" rule is superseded (see spec).
  - Portraits in `public/images/` (sources in iCloud
    `Desktop/Portraits/`): header avatar flips illustration→photo on
    hover; the home page opens with the interactive halftone portrait
    (canvas dot screen in the foreground token, pointer swell/repel —
    see design-language "Technical print"). Base typography is 14px
    site-wide; ruler ticks joined the drafting guides; home list rows
    enter center-out with a tiny swing.

- **Round 2 (July 2026)**: 14px base; halftone hero at 3px cells / 16%
  swell; reveal system rebuilt (750ms arm, one-shot IO, DOM-order batches
  80ms+45ms, +5px rise); progressive-blur viewport edge fades; post images
  scatter ±3° and straighten/zoom on hover; covers rest as Bayer-dither
  prints with braille date captions and develop on hover; homepage carries
  bio + dated experience (from v1 resume data), a vinyl shelf
  (word-raster sleeves, spinning disc) and a bookshelf stub; X + GitHub
  hover cards with baked data (`content/social.json`, `content/github.json`,
  refresh scripts in `scripts/`). **Cali TODO**: fill `lib/personal.ts`
  books (shelf renders from it; a full 3D spine/cover shelf with
  leaning-neighbor physics is the target once real books + cover art
  exist — recipe noted in session research), update social.json follower
  count occasionally, drop real record art into public/images/records/.

- **Round 3 (July 2026)**: stronger edge fades; halftone hover calmed
  (8% swell / 3px repel); reveal nested choreography (+250ms image develop
  inside revealed blocks, `--ease-pop`); blog index → one-line rows
  (dither thumb · title · dotted leader · date, center-out swing); post
  heroes wear the collage veil (dither/ascii/photo panels); post images
  ±1° scatter; back pill on posts; rulers full-bleed, bottom center dots
  removed; `/projects` page (`lib/projects.ts`, from v1 Sanity data) +
  header nav; vinyl shelf revamped with real album art (iTunes fetch,
  `public/images/records/`) + peeking disc; bookshelf is now the 3D
  accordion (open cover + neighbors leaning in, 650ms easeInOutCubic) —
  **test covers from Open Library are stand-ins** (`identity-designed.jpg`
  is actually Logo Design Love; `icons` missing); Cali: replace
  `lib/personal.ts` books + `public/images/books/` with the real shelf.

- **Round 4 (July 2026)**: post pages grew a left-margin **table of
  contents** (`components/post-toc.tsx` + `extractHeadings` in
  lib/content.ts — github-slugger parity with rehype-slug's ids,
  reading-line scroll-spy); vinyl sleeves are worn paper (seeded creases +
  grain, disc peeks out the top, no spin); hero caption removed;
  **bilingual chrome** (`lib/i18n.tsx`, CSS-swapped dual render — see
  spec "Bilingual chrome"): nav/sections/dates/cards/projects all zh⇄en,
  footer 中/EN toggle, locale restored pre-paint. Experience roles and
  project descriptions carry `roleEn`/`descriptionEn` in their registries.

- **Round 5 (July 2026)**: home 写作 section uses the shared one-line
  `PostRow` (leader dots faded 25%); collage veil is now **scattered
  voronoi patches** (~10%, seeded, one dither + one ascii per cover);
  light-mode halftone hero fixed to a positive print (midtone-inked —
  highlights stay open paper); socials expanded to **X/Twitter, Telegram,
  YouTube, GitHub**, all with hover cards (snapshots in
  `content/social.json`); `/photos` masonry (2→3 cols, v1 hero collage
  photos in `public/images/photos/`, lightbox + tilt) + nav; TOC gained
  the self-drawing squiggle marker, ghost title (±12px hysteresis,
  click-to-top), click-pinning until scroll settles, and page-extreme
  overrides. TOC hover-peek (temporary scroll + section bracket) noted as
  a future candidate — skipped, our spec forbids scroll hijacking.

- **Round 7 (July 2026)**: footer as a Swiss editorial grid (three
  micro-labeled columns, `[ label ]` bracket links, colophon line); nav
  backdrop blur actually works now (utility-class layers — see the new
  gotcha), and the post-cover collage veil became an **entry glitch**:
  five voronoi patches of dither/ascii flash 2–3 times staggered over
  ~620ms, then the photo settles clean (once per mount, skipped under
  reduced motion).
- **Round 6 (July 2026)**: light-mode halftone hero curve now lifts
  shadows (sqrt) so hair prints; voronoi veil trimmed to ≈6% (33 seeds);
  footer split into two rows (+ RSS link); header is sticky with a
  progressive-blur backdrop (replaced the top scroll-fade; back pill/TOC
  offsets moved down accordingly); Telegram card copy is personal
  (给我发消息), not a channel; photos enter center-out with the swing.

- **Round 8 (July 2026)**: footer columns are folder trees (├─/└─
  connectors, brackets dropped); language switcher is the fluid
  borderless Select and the theme switcher the fluid Tabs (registry
  components in components/ui/ — note SelectItem requires `index`, and
  fluid Tabs only respond to real pointer events, not synthetic .click());
  glitch coverage choreographed 10→38→10% via 13 patches; nav
  difference-blend reverted; hero halftone is dual-source — light mode
  prints the clean headshot (ink ∝ darkness), dark keeps the studio
  portrait, theme flips crossfade the two dot fields over 550ms.

- **Round 9 (July 2026)**: fluid Select/Tabs rethemed onto site tokens
  (surface scale from --popover, hover/active tints defined — they were
  silently missing, neutral focus ring, 150ms hover timing, chrome-scale
  sizes); top nav replaced by the **global pill dock** (bottom center,
  avatar = home + icon items, active dot, tooltip labels, patterned on
  Cali's cleansink MainDock); header veil retired, top edge fade restored
  (fade-only); light-mode hero halftone keeps side/bottom edge fades but
  none at the top (the headshot's hair meets the frame).

- **Round 9b (July 2026)**: the dock grew a 偏好/Preferences item —
  a fluid `@fluid/dropdown` panel (opens upward) holding language, theme,
  and a new **UI sound** preference as full-width fluid tabs. Sound is
  off by default (`lib/sound.ts`, localStorage `sound`); when on, dock
  navigation and preference changes play a tiny WebAudio tick — the
  hook future sounds should use. The footer's 偏好 tree column moved
  here (footer is now two trees + colophon); the old standalone
  locale/theme toggle components are deleted.

## Work queue (rough order)

1. **Pages**: `/about`, `/ama` (port from `main`, it's fully static) —
   `/projects` shipped in round 3.
2. **AMA page rebuild** (parked by Cali, July 2026): bring back `/ama` in
   the v2 design language. Explicitly NOT porting the v1 Alipay QR — Cali
   will connect Stripe himself, and booking becomes a **self-built
   calendar system** (no cal.com). Don't ship until payments + booking are
   designed.
3. **Newsletters + admin + magic-link auth** (ADR-0004): subscribers/
   newsletters tables stay; Resend already in env. Single allowlisted email,
   15-min single-use token, rate-limited request, signed httpOnly ~30d
   session cookie.
4. **Per-service hover cards** (films/music per the
   design-language contract — the external-link preview card is the shared
   base), staged title card on post open, print-pile list thumbnails.
5. **Cutover checklist** (do NOT do early): crawl live v1 URLs and verify
   100% (issue #75 acceptance criteria); drop `comments`/`guestbook` tables
   (data already archived privately); decommission Sanity only after all
   content verified in prod; gate on Next 16.3 stable (ADR-0005).

## Gotchas

- **Raw `backdrop-filter` gets stripped by the CSS pipeline** (Tailwind
  v4 / LightningCSS) — rules compile but the declaration vanishes, so the
  effect silently no-ops. Use Tailwind's `backdrop-blur-[Npx]` utilities
  on real elements instead (see `.site-header-veil*` and the bottom
  scroll fade). Masks/gradients in plain CSS survive fine.

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
  captions and illustrations; accent color / warm-vs-neutral palette.
- **Future craft candidates** (studied, not built): a global `--speed`
  multiplier on every JS-driven duration; per-route generated favicons;
  custom text-selection rendering; subtle navigation audio. Also: real
  avatar image for the tweet card snapshot.

## Key documents

- `docs/adr/0001–0006` — why things are the way they are
- `docs/design-language.md` — the buildable UI spec
- `docs/agents/*` — issue tracker / triage / domain-docs conventions
- Issue #75 — URL back-compat ship gate
