# v2 Handoff

Status snapshot for whoever (human or agent) picks this up. Last updated
July 2026.

> **Current working state (July 13, 2026)**: all work through round 13b
> is committed and merged into **`v2`** (at `882b319`, pushed).
> **`v2` is the integration branch — land session branches there, never
> `main`.** `main` is still the live v1 site and only receives `v2` once,
> at cutover (see the checklist in the work queue). Cali commits by
> saying "lfg" (his alias for stage-all + conventional commit); don't
> commit without it. Dev server: the Browser pane runs it from
> `.claude/launch.json` (`autoPort: true` — do NOT hardcode a port;
> next dev respects the assigned PORT env). Verify with the pane or the
> `agent-browser` CLI. Production build is green with every route static
> + 6h ISR revalidate (see round 13's live social data).

## Where things stand

Working and verified (light/dark/mobile, production build green):

- **Platform**: Next.js 16.3.0-preview.5, React 19, Tailwind v4, pnpm.
  shadcn + the `@fluid` registry in `components.json` (pinned to the
  **Base UI flavor** — all popup primitives are `@base-ui/react`; no
  Radix anywhere since round 11). Fonts: Geist (Latin) + Frex Sans GB (CJK fallback,
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
  **test covers from Open Library were stand-ins**; they were replaced with
  Cali's real ten-book shelf in the July 13 taste-shelf pass.

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

- **Round 13b (July 2026)**: the 打招呼/Say hi dock item was removed
  (`components/say-hi.tsx` deleted — the morph-card pattern lives on in
  git history at fed17bf if it's ever wanted back; `SayHiIcon` stays in
  dock-icons). The dock is back to avatar/writing/photos/projects/偏好,
  and the footer 联系 tree is the contact surface. Bottom ruler rides
  12px lower (inset 18 → 6). Footer is a single row now — a
  `[1fr_1fr_auto]` grid of 联系/索引/colophon (colophon bottom-right,
  stacking back to 2-col + full-width on mobile), tree rails dimmed
  40% → 22%. Prose `ul` markers are 5px squares (the dither cell
  vocabulary) instead of en-dashes — note no current post uses a ul;
  verified with an injected list. Records and books now sit on wooden
  planks (`.room-shelf` wrap + `.room-shelf-plank`, oak/walnut per
  theme, contact shadows per item). Neither shelf is an inner scroller
  (overflow visible; vinyl sleeves compress on narrow screens via
  `flex: 0 1 6rem`), and the bookshelf's old hairline shelf-line is
  gone — books rest directly on the plank. Vinyl hover no longer scales the
  sleeve — only the disc slides further out (−12% → −30%).

- **Current July 13 footer revision (uncommitted)**: the desktop colophon puts
  copyright at the top and Cali's live Asia/Taipei clock (`UTC+8`) at the
  bottom. The previous-visitor experiment was removed. On mobile, contact and
  index stay side by side and the colophon follows them as the final row, with
  copyright and clock placed in opposite columns.

- **Current July 13 post polish (uncommitted)**: blog catalog thumbnails now
  sit over two static paper sheets while the foreground 64×44 dither print
  remains the shared cover morph. Opening a post leaves the shared h1 in charge
  of the transition, develops its metadata after the 320ms morph window, then
  brings in the prose at 520ms. Reduced motion disables the full sequence.

- **Current July 13 post minimap (uncommitted)**: the old desktop-only heading
  list and separate back pill are replaced by a collapsible document minimap.
  The title and h2/h3 landmarks are separated by three quiet ticks regardless
  of section length, and remain hash-linked, focusable jump targets tracked
  against a fixed 100px reading line. It opens by default at ≥64rem with a
  one-time center-out develop on mount, and becomes a borderless left-edge
  compact rail from 40–63.99rem that reveals in place without moving itself or
  the article horizontally. Across that compact range, its open state carries a
  masked 8px backdrop blur that fades into the page and disappears when closed
  so overlapping prose stays legible. Below 40rem it becomes a
  top-center translucent reading island: the collapsed 44px pill carries a
  circular document-progress ring, the article title, and an animated chevron;
  it develops after the title card clears the reading line and retreats on a
  return to the hero. Opening grows the same clipped surface around the
  internally scrolling tick map, which begins at the first heading instead of
  repeating the article title, while the post stays still underneath. Outside
  taps and landmark selections collapse the compact map. Map
  items remain mounted and use Motion's DOM animator rather than leaking native
  view-transition snapshots. All layouts keep inert/ARIA, Escape, and
  reduced-motion behavior. Compact 1px nodes use
  two-line-clamped labels and a viewport-aware max height. Every tick and
  landmark shares the same 9px vertical step; labels overlay that fixed track
  and shift right when active, hovered, or keyboard-focused to clear the lead
  tick. The old back-to-writing link is gone. Motion staggers item entry and
  exit from the center with a subtle vertical swing.

- **Current July 13 taste-shelf polish (uncommitted)**: the homepage sections
  now read 让我动起来的音乐 / Music That Gets Me Going and 启发我的书 / Books
  That Inspire Me. Selected album/book annotations use muted foreground ink,
  and record sleeves gained a quiet layered drop shadow.

- **Current July 13 sound split (uncommitted)**: dock destination changes and
  preference changes no longer share one tick. The requested Cuelume package
  supplies `chime` for dock navigation and `success` for language/theme/sound
  changes. Accepted blog post cover toggles use `sparkle` when developing the
  dither print and `droplet` when clearing it. Clicking the already-active dock
  destination remains silent.

- **Round 13 (July 2026)**: `/about` merged back into the homepage —
  the taste sections moved below 写作 (music/books remain; the movie and
  people experiments were later cut); the page and its footer link are gone.
  Social data went **live with
  ISR**: `lib/social-live.ts` fetches GitHub (contributions + followers,
  6h revalidate) and the YouTube subscriber count (12h) through the
  fetch data cache from the root layout; every route stays static with
  a 6h Revalidate column, so counts refresh without a redeploy. The
  baked `content/*.json` are now fallback seeds (scripts still refresh
  them); X stays manual — no public endpoint (handle is now
  `calicastle`, count 24.3k). Footer 社交 → 联系/contact; hover cards
  are non-interactive (`pointer-events/user-select: none`); the Email
  card became an envelope (copy UX dropped — `ui/input-copy.tsx` and
  `ui/tooltip.tsx` remain in the kit, unused); GitHub heatmap now shows
  ~180 days (26×7 at 7px cells) with the past-year stat kept.

- **Round 12 (July 2026)**: social cards simplified — Telegram is
  identity-only, YouTube drops its bio for a subscriber count (1.91K,
  baked via new `scripts/refresh-social.mjs` scrape), GitHub's stat line
  gains followers (865, now fetched in `refresh-github.mjs`), X
  unchanged. The footer grew an **Email** item: the link opens
  mailto:hi@cali.so, its hover card is a fluid **InputCopy** (click
  copies, execCommand fallback included). The shadcn registry is now
  wired up for real — `components.json` points `@fluid` at the **base
  flavor** (`/r/base/{name}.json`, matching our Base UI stack);
  `npx shadcn@latest add @fluid/tooltip` pulled the base tooltip, and
  input-copy (default-flavor only in the registry) was placed by hand
  with its tooltip import swapped to ours + the usual retheme (150ms,
  neutral focus ring, --active highlight). Cover veils: entry rhythm is
  now · — · · – and hover UX is GONE — clicking the cover toggles
  photo ⇄ the full dither print via a **Bayer dissolve** (cells
  materialize in the matrix's own 16-threshold order, reversing on the
  way back; fully interruptible — a level/target walker turns around
  mid-flight on re-tap, with a full-canvas clear on reaching empty
  because per-cell clearRect leaves antialiased residue on fractional
  cell boundaries; ripple + collage/sticker variants were tried and
  dropped)
  (see the design language's print-veils section; a spotlight-hover
  variant was built and immediately superseded by the ripple).

- **Round 11 (July 2026)**: **Radix → Base UI migration** — every popup
  primitive now comes from `@base-ui/react` (1.6.0), all `@radix-ui/*`
  packages removed (including the dead `radix-ui` umbrella). The fluid
  components went back to their registry originals (which are Base UI
  native) with our retheme deltas re-applied: dropdown/menu-item (Menu.*,
  actionsRef deferred unmount replaces the forceMount hack), tabs
  (`activateOnFocus` keeps arrow-keys-activate; h-6/px-2 sizing and the
  icon-only label guard survive), select (collectSelectItems feeds Root
  `items` — Base UI only mounts items while open; `alignItemWithTrigger`
  must stay false), button (cloneElement asChild, no Slot). Hover cards
  are Base UI PreviewCard: delays live on the Trigger (ours 300/100 and
  300/120 — defaults are 600/300), positioning on the Positioner, and the
  CSS hooks changed: `[data-state='open']` → `[data-open]`,
  `[data-state='closed']` → `[data-ending-style]` (the exit-animation
  attr Base UI waits on before unmounting), transform-origin var is
  `--transform-origin`, trigger-width var is `--anchor-width`. Both
  menu/select Positioners pass `positionMethod="fixed"` — the dock is
  position: fixed and non-modal popups would lag it on scroll under the
  default absolute strategy. `DropdownMenu` grew an `orientation` prop;
  say-hi passes "horizontal" so ArrowLeft/Right traverse the icon row.
  An adversarial review workflow confirmed and we fixed: the umbrella
  dep, a reduced-motion ordering bug on `.service-card[data-open]`
  (needs its own guard after the animation rule), and the orientation
  gap. zoom-image's `data-state` is our own component's attr — untouched
  on purpose.

- **Round 10 (July 2026)**: the dock went **liquid glass**
  (`components/liquid-glass.tsx`): displacement-map refraction with
  chromatic fringe + specular rim (white 0.2/0.06) over a bg dropped
  98% → 55%. A clarity slider for it was built and then dropped as
  gimmicky — if it ever returns, know that React 19 hydration wipes
  pre-paint inline styles off `<html>`, so persisted vars must re-apply
  on mount (next-themes does the same). Chrome tightened alongside:
  prefs controls hug contents (TabItem h-6/px-2, icon-only tabs skip the
  phantom label gap, panel `w-max` over the fluid `w-72`), dock dividers
  read again (16% ink instead of the border token, which vanished on
  glass), hover cards pad 10×12px — and they must stay
  `position: relative`: static dock children paint below the glass layer
  and get blurred into the backdrop. The dock also grew a 打招呼/Say hi
  item (`components/say-hi.tsx`, waving-hand duotone from Cali) left of
  偏好: a dropdown of every contact route — X/Telegram/
  YouTube/GitHub brand glyphs (handles read from `content/*.json`) plus
  mailto hi@cali.so — laid out as a horizontal icon-only row (Radix Item
  primitives keep keyboard activation). One shared hover card floats
  above the row and MORPHS between services — framer layout projection
  springs position+size while contents crossfade (250ms open, instant
  glide once open, only ever one card). Card bodies are extracted as
  `*CardBody` exports in `components/social-cards.tsx` so the footer
  links and the dock serve identical cards. All per the
  spec's "Liquid glass dock" section (Chromium refracts, Safari/Firefox
  fall back to a frosted pane; filter id refreshes per resize). Ruler tick
  inks dimmed 15% (0.55 → 0.47 major, 0.4 → 0.34 minor), and the rulers
  themselves bent into arcs (`components/arc-rulers.tsx`, replacing the CSS
  gradient strips): SVG paths with dash-rendered ticks, curving off-screen
  before the left/right edges.

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
  navigation and preference changes play distinct Cuelume WebAudio cues through
  the shared `lib/sound.ts` preference wrapper. The footer's 偏好 tree column moved
  here (footer is now two trees + colophon); the old standalone
  locale/theme toggle components are deleted.

## Work queue (rough order)

1. **Pages**: `/ama` remains (see item 2) — `/projects` shipped in
   round 3, `/about` shipped in round 13 then merged back into the homepage in
   round 13b — the taste sections (唱片机, 书架) now sit below the main home
   content (a 仰望的人 people list was tried and cut — too much like a
   roll call). Hover-card positioners are pointer-events-none too, so
   the whole card overlay is hit-test invisible. Home now carries hero,
   doorway row, 经历, latest 写作, and Cali's real taste shelves.
2. **AMA page rebuild** (parked by Cali, July 2026): bring back `/ama` in
   the v2 design language. Explicitly NOT porting the v1 Alipay QR — Cali
   will connect Stripe himself, and booking becomes a **self-built
   calendar system** (no cal.com). Don't ship until payments + booking are
   designed.
3. **Newsletters + admin + magic-link auth** (ADR-0004): subscribers/
   newsletters tables stay; Resend already in env. Single allowlisted email,
   15-min single-use token, rate-limited request, signed httpOnly ~30d
   session cookie.
4. **Cutover checklist** (do NOT do early): crawl live v1 URLs and verify
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
