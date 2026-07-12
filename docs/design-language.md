# v2 Design Language

The visual and interaction spec for cali.so v2. It extends the component stack
in ADR-0006 (motion is information, not decoration). Rules here are written to
be buildable: when a value is stated, use it; when a component is described,
its behavior spec is the contract.

The header is sticky (z `--z-nav`) with a two-layer progressive-blur
backdrop (8px masked to ~58%, 18px hugging the top edge, background tint
82%→transparent) so passing content fades under the chrome; the top
viewport fade lives there, the bottom one stays a fixed overlay. The
footer is two rows: service links + locale/theme toggles above, © + RSS
below.

## Motion system

Token set (define in `globals.css`, use everywhere — no ad-hoc cubic-beziers):

```css
--ease-swift: cubic-bezier(0.2, 0.8, 0.2, 1);       /* UI: enters, exits, movement */
--ease-spring: cubic-bezier(0.34, 1.56, 0.64, 1);   /* playful objects: overshoots  */
--ease: ease;                                        /* hover/color                  */
```

Two motion families. **UI chrome** (tooltips, dropdowns, hover cards, focus)
uses `--ease-swift` at 150–200ms — quick, decisive, no bounce. **Physical
objects** (the photo covers, anything meant to feel picked up) use
`--ease-spring` at 300–350ms — the overshoot reads as springiness; never use
it on chrome.

| Motion | Duration | Easing |
| --- | --- | --- |
| Hover/color change | 150ms | `ease` |
| Tooltip, dropdown, hover card enter | 150–200ms | `--ease-swift` |
| Exit (any) | ~2/3 of its enter | `--ease-swift` |
| Photo pick-up / settle | 300–350ms | `--ease-spring` |
| Shared-element page transition | 300–350ms | `--ease-swift` |

Shadow scale (one alpha, growing throw — don't invent one-off shadows):

```css
--shadow-small:  0 5px 10px rgb(0 0 0 / 0.12);
--shadow-medium: 0 8px 30px rgb(0 0 0 / 0.12);
--shadow-large:  0 30px 60px rgb(0 0 0 / 0.12);
--shadow-tooltip: 0 4px 8px rgb(0 0 0 / 0.04), 0 1px 1px rgb(0 0 0 / 0.02);
```

Hard rules:

- Animate `transform` and `opacity` only. Never `height`, `width`, `margin`,
  `padding`, or blur above 20px.
- The frequency principle: anything used 100+ times a day (theme toggle, nav
  links) gets no entrance animation. Keyboard-initiated actions are never
  animated.
- Elements that move together share one duration and easing (card + its
  shadow, cover + its caption).
- Scroll reveals are allowed only as gentle arrivals: below-fold long-form
  blocks may sharpen in (blur 2px → 0 + fade, 300ms `--ease-swift`, ≤45ms
  stagger within a batch) as they enter the viewport. Never parallax, never
  scroll hijacking, never hiding content behind JS — the hidden state is
  applied by script, so content without JS (or with reduced motion) is
  simply there.
- Springs (via the fluid components) are reserved for interruptible,
  pointer-driven motion — proximity hover, drag. Bounce stays in 0.1–0.3.
- Every animation has a `prefers-reduced-motion: reduce` branch that sets
  `animation: none` / `transition: none` — including opacity fades, no
  exceptions. Theme switching disables transitions while it applies.

## Typography

- Stack: Geist (Latin) → Frex Sans GB (CJK) → system, per `app/fonts.ts`.
  Weights 400/500/600 only, as `--font-weight-{normal,medium,semibold}`
  variables. Weight never changes on hover or selection — state is shown with
  color, never with weight or size.
- **One size for chrome.** Site chrome — header, nav, footer, list rows,
  dates, section labels, even page-level headings outside post bodies — is a
  single size (14px, letter-spacing −0.011em); hierarchy comes from weight
  and color only. Resist adding a size before exhausting weight + color.
- **One base size: 14px.** Post bodies match the chrome at 14px/1.7 (CJK
  line-height 1.85) — density is part of the print voice. Post titles may
  still be large; prose h2 is 18px, h3 16px, code 13px. Form inputs are the
  one exception: they stay ≥16px to prevent iOS zoom. Headings use
  `text-wrap: balance` and tighter letter-spacing as size grows.
- Content column is narrow: ~600px (`37.5rem`) plus padding.
- `font-variant-numeric: tabular-nums` on anything that counts: dates in
  lists, reading time, subscriber counts.
- Curly quotes, real ellipsis (…), full-width CJK punctuation left alone.
  `-webkit-font-smoothing: antialiased` on `body`.

## Color, borders, dark mode

- Grays are a numbered scale (`--gray-1` … `--gray-12`) that flips wholesale
  in dark mode. Components reference scale variables, never Tailwind `dark:`
  overrides — if a component needs a `dark:` modifier, the token is wrong.
- 1px borders are the exception: prefer `box-shadow: 0 0 0 1px` for card
  edges (blends with any background) and hairline dividers via
  `--border-hairline` (0.5px on retina, 1px otherwise).
- Focus rings stay neutral (gray/black/white), visible on `:focus-visible`,
  and are never removed.
- Z-index scale: `--z-nav: 100; --z-card: 200; --z-toast: 300`. Nothing else.
  Prefer `isolation: isolate` over a new z-index.

## Writing style

Titles do the work: post listings are title + date, no descriptions. Titles
are short, concrete, and conversational — "为什么按钮不需要手指光标" not
"关于按钮光标设计的一些思考与实践". Section headers are one or two words.

## Entrance choreography

Entrances continue the selective-focus grammar: blocks *develop* into
focus (blur 4px → sharp + fade, 350ms `--ease-swift`) with inline per-item
delays — ~100ms base, 35–65ms steps, total under ~600ms. Nothing slides;
blur stands in for "not yet attended". Listing polaroids instead pop like
prints dropped on the sheet (rotate from base+1.5°, `scale(0.85)`, 350ms),
65ms apart — and are skipped after the first visit in the session
(`html[data-visited]`, set pre-paint). Entrance and reveal animations use
`animation-fill-mode: backwards` — a forwards fill would pin the keyframe
value and dead-lock hover transitions on the same properties. Reduced
motion disables every entrance.

## Hover cards as craft objects

Inline mentions of external presences (social profile, code, films, music)
open rich hover cards. The contract:

- **Per-service design.** Each card is composed for its service — no generic
  "avatar + handle" template. The card's *content* also animates, not just
  its container:
  - Code card: a real contribution graph (26 week columns — the recent
    ~180 days; the stat below still counts the past year, hairline 0.5px
    cell borders) whose cells **cascade in individually** — each cell rises
    from `translateY(4px) scale(0.92)` over ~0.48s with a per-cell stagger.
  - Films card: recent posters as a **fanned stack** (≈64×96px each,
    overlapping by −8px), each poster entering **blur(4px) → sharp** with a
    per-poster delay.
  - Social card: avatar, name + verified mark, bio, follower stats in
    `tabular-nums`.
  - Music card: current/last track with artwork.
- **Behavior.** ~256px fixed-width card, 300ms open intent delay (0ms when
  moving between adjacent triggers), enter 200ms `--ease-swift` from
  `scale(0.95)` + `opacity: 0`, `transform-origin` at the trigger,
  `backface-visibility: hidden`. Exit faster than enter. Built on the fluid
  hover-card primitive so pointer exit mid-animation reverses smoothly.
- **Fixed dimensions per card type** — content loads into a fixed-size card
  (skeleton first), never resizing after open. No layout shift, ever.
- **Touch fallback.** Hover cards require `@media (hover: hover) and (pointer:
  fine)` and are simply absent on touch — the trigger is a plain link to the
  destination (or inert text if there is no destination). The card is an
  enhancement, never the content.
- **Data at build time.** Card data (grid, films, tracks) is fetched at build
  / ISR, not on hover; an open card never spinners on network.
- All content animations inside cards respect `prefers-reduced-motion`.
- **Implemented service cards** (`components/social-cards.tsx`, chrome
  social links): the X card (avatar, name/@handle, bio, follower stat) and
  the code card — a real 52×7 contribution grid, 4px cells on 1px gaps,
  ink = foreground alpha ramp (7/30/52/74/100%), each cell cascading in
  (`translateY(4px) scale(0.92)`, 480ms, ~1.1ms/cell stagger). Data baked
  at build into `content/social.json` + `content/github.json`
  (`scripts/refresh-github.mjs`); zero network on hover; snapshots never
  spinner. Touch follows the plain link.
- **The implemented base: external-link previews.** Every external link in
  prose carries a 14px inline favicon (fixed slot, no layout shift) and — when
  build-time metadata exists in `content/link-previews.json` — a preview card
  (favicon + domain, title, two-line description) on the shared hover-card
  primitive (`components/external-link.tsx`). Refresh the metadata with
  `node scripts/refresh-link-previews.mjs`.

## Image lightbox

Post images zoom on click: the photo is picked up off the page (FLIP,
transform-only, 300ms `--ease-swift`) and floats centered over the dimmed
sheet at no more than its intrinsic size, gaining `--shadow-large`. Esc,
click, or the first scroll puts it back. The inline image keeps its spot
(zero layout shift); reduced motion swaps instantly. `components/zoom-image.tsx`.

## Portrait & avatar

The site carries its author: the header shows the line-art avatar, and on
hover it blinks into the real photo (150ms crossfade, hover-capable pointers
only). The home page opens with the halftone portrait hero (below).
Illustration, photo, and print are three registers of the same person; use
the illustration where chrome should stay quiet, the photo where a human
moment is wanted, the print where the page itself should feel authored.

## Technical print

A second ambient register alongside the drafting sheet: the marks of
reproduction — halftone dot screens, diagonal line rasters, dither fields,
typewriter/ascii textures, measuring ticks, registration marks. Rules:

- **Ink is always the foreground token** on transparent ground, never a
  boxed image — prints must dissolve into the paper in both themes.
- **The halftone portrait hero** (`components/halftone-portrait.tsx`): the
  home portrait rendered as a dot screen on canvas — dot radius ∝ auto-leveled
  luminance (p5–p95 stretch), ~5.5px cells, dots taper at the edges and
  below a 6% floor so the figure emerges from nothing. A fine pointer swells
  (+40%) and repels (≤7px) dots within ~150px, smoothed per-frame (0.16
  lerp, rAF only while active). Touch and reduced motion get the static
  print; no-JS gets the photo printed down (grayscale, 85%).
- **Rulers**: measuring ticks (48px major / 12px minor) ride top and
  bottom as arcs of an enormous circle (fixed 40px rise at the viewport
  edge, so R = w²/8s at any width) — a bent steel rule whose ends bow away
  and leave the screen before the corners; the apex hugs the horizontal
  guide. Ticks are dashes on the stroked path (`components/arc-rulers.tsx`),
  perpendicular to the curve for free. Same missability contract as the
  guides.
- **Print veils** (`components/dither-veil.tsx`): cover images rest as
  ink-on-paper prints, identical in both themes (paper
  `oklch(0.98 0.004 95)`, ink `oklch(0.28 0.012 95)`), developing into the
  true photo on hover/focus (300ms). Two modes: pure ordered dither (4×4
  Bayer, 2.5px cells — list thumbnails), and the collage — seeded vertical
  panels of dither, ascii raster (7px cells, ` -li+tcsea` ramp — the letters of
  "cali castle" plus - and +, ordered by ink), and a
  window of the original photo (post heroes). Post covers enter with a
  morse-choreographed glitch (· — · · –, coverage ≈9→39→12→12→12%);
  afterwards **clicking toggles photo ⇄ the full dither print** through
  a Bayer dissolve: cells materialize (and dissolve away in reverse) in
  the order of the matrix's own 16 thresholds, 38ms per step — the image
  passes through its own printing screen. Fully interruptible: a walker
  chases the tap's target one threshold per tick, so tapping mid-dissolve
  just turns it around from wherever it is. Works on touch; reduced motion
  swaps instantly. No hover behavior — the print answers to touch, like
  paper. Captions on covers are
  braille numerals (`lib/braille.ts`); readable dates stay for assistive
  tech.
- **Blog index rows**: one line per post — 64×44 dithered print thumb
  (still the shared morph element), title, dotted leader (the typewriter
  TOC register), tabular date. Rows swing in center-out.
- **Hover cards are informational only**: `.link-card` carries
  `pointer-events: none; user-select: none` — a card is a printed label,
  never a control. Email's card is a little paper ENVELOPE (folded flap,
  perforated avatar stamp, mono address); the trigger opens mailto:.
- **Film tickets** (`components/film-tickets.tsx`, home): admission
  stubs — card-stock slips with a dashed perforation, punched notches,
  and a vertical 入场券 stub label; seeded tilts that straighten on
  hover, same contract as post images.
- **Room shelves** (`.room-shelf-plank`): records and books rest on an
  actual wooden plank — edge grain drawn with layered CSS streaks over an
  oak tone (walnut in dark), top highlight, wall shadow beneath, and
  per-item contact shadows where things meet the wood. The shelf runs the
  full column even when half empty — that's the point.
- **Paper record sleeves** (`components/vinyl-shelf.tsx`): album art
  printed on worn paper — seeded crease streaks (2–3 diagonal light/dark
  gradients per album) under a grain overlay (`mix-blend-mode: overlay`).
  The vinyl peeks out the top (−12%), and on hover only the disc slides
  further out — the sleeve stays put on its shelf. The disc
  never spins. Sleeves without art fall back to the word-raster texture.
- Future candidates: ascii-on-hover for photos, dithered media
  placeholders, line-screen section dividers. One instrument per page —
  never stack rasters over each other.

## Entrance swing (lists)

Compact list rows may enter with a tiny swing — `translateY(12px)
rotate(-2°)` + blur → settled, 400ms `--ease-swift`, staggered **from the
center out** (50ms steps). Reserve the swing for item collections; prose
and chrome develop without rotation.

## Selective focus

The governing attention grammar: **only the thing being attended to is
sharp.** Applications:

- **List rows (writing index, home list)**: hovering a row blurs (~1–2px) and
  dims everything else on the page over ~200ms `--ease-swift`; mouse-out
  restores instantly. The hovered row itself does not move.
- **Media loading**: images/video in card grids sit as blur-up placeholders
  and resolve to sharp when loaded or attended.
- Focus-pull requires `@media (hover: hover) and (pointer: fine)` and is
  fully disabled under `prefers-reduced-motion` (no blur transitions —
  content stays sharp).

## Post marginalia

At ≥64rem the post's left margin carries its wayfinding: the back pill on
top, the table of contents below (fixed, 11rem wide, 13px, muted at 75%
opacity; the section being read — last heading above the ⅓-viewport
reading line — holds full foreground ink). Clicking smooth-scrolls
(instant under reduced motion); headings carry `scroll-margin-top` to
clear the edge fade. Below 64rem the margin chrome is simply absent.

## Bilingual chrome

Chrome strings render in both languages in the static DOM
(`lib/i18n.tsx`'s `<T zh en>` + `<LocalDate>`), and CSS shows one based on
`html[data-locale]` — restored pre-paint from localStorage, flipped by the
footer toggle. No routes, no hydration risk, fully static. Post bodies
keep their own `lang` (the article pins `zh-CN` so CJK prose metrics hold
in either chrome language).

## Back pill

Post pages float a 36px circular back control in the left margin (fixed at
≥52rem, inline above the cover below that), hairline ring + tooltip shadow,
color-only hover. It returns to the index, so the cover/title morph plays
in reverse.

## Liquid glass dock

The dock pill is real glass: a runtime-built displacement map (rounded-rect
SDF, four-fold symmetric — one quadrant computed, mirrored into four; R/G
channels encode the x/y bend, ramping outward through a 16px edge band,
curve 1.6) drives an SVG `feDisplacementMap` applied as an inline-style
`backdrop-filter: url(#…) blur(2px) saturate(1.4)` over a 55% paper
background. Three displacement passes at staggered scales (44 ±10%) split
the RGB channels for a faint chromatic fringe along the rim, recombined
with screen blends; an inset top highlight (white 0.2 over, 0.06 under) plays the
specular. The map and
filter get a fresh id on every resize. Chromium-only by design —
Safari/Firefox can't run SVG filters in `backdrop-filter` and get a plain
frosted pane (blur 6px) instead. The `backdrop-filter` must stay inline:
LightningCSS strips the raw property from stylesheets.

## Fluid page transitions

Index → post navigation continues the selective-focus grammar: the origin
page defocuses (the hovered row already sharp), and the post rises over that
blurred backdrop — cover and title morphing as shared elements over 300–350ms
`--ease-swift`; the rest crossfades. Post pages may open as a staged title
card (title + date settle first, content follows). Browsers without view
transitions get instant navigation — no JS fallback animation. Reduced motion
disables all of it. Transitions never delay navigation: content is statically
generated, and the transition plays over already-available content.

Implementation: `experimental.viewTransition` + `view-transition-name` pairs
(`cover-<slug>` via PolaroidCover's `morph` prop, `title-<slug>` on row
title/post h1). Root: old page 250ms fade + `blur(2px)` defocus, new page
300ms focus-in; shared groups 320ms `--ease-swift`. Entrance choreography on
the destination chains after the morph window.

## Instant-photo cover treatment

Post covers render as instant-print photographs. Governing principle: the
photo is a physical object you pick up — and **paper doesn't squish** (scale
and fade it, never deform it).

- White frame: 4% of width on three sides, 14% at the bottom; bottom edge
  carries an optional caption/date in a small handwriting-feel face. An inner
  hairline ring where photo meets frame (inset shadow ≈ `rgb(0 0 0 / 0.14)`)
  sells the print edge.
- Deterministic base tilt of −2° to 2° derived from the slug (stable across
  builds).
- **Hover = pick-up, not flatten**: rotate a further +1.2° from the base tilt
  and scale to 1.03, 300ms `--ease-spring`, `@media (hover: hover)` only.
  Press (`:active`) squishes the *gesture* — `scale(0.94)` — not the paper.
  Exception: a photo with interactive affordances on it may straighten on
  hover instead, so its controls are easy to grab.
- Entrance (first paint of a listing): pop in from `rotate(base ± a few deg)
  scale(0.85) opacity 0` to settled, ~350ms, staggered ~65ms per photo.
  Scale + fade only. Skip after first visit in the session.
- Shadow: `0 2px 4px -1px rgb(0 0 0 / 0.18)` at rest, stepping up the shadow
  scale on hover with the same timing as the pick-up.
- The same treatment renders the OG image, so a shared post is recognizably
  the same object.
- The frame is a component (`PolaroidCover`), not per-post CSS.

## Ambient background: paper, grain, and guides

The page reads as a sheet of working paper, not a void:

- **Grain**: a tiled noise texture over the whole page (fixed, tiled,
  `pointer-events: none`), at an opacity just past the threshold of
  perception. Light and dark modes get separately tuned strengths.
- **Guides**: the content column is boxed like a drafting sheet — fine
  dotted rules (0.5px dots at 4px spacing) running the column width near the
  top and bottom viewport edges, plus full-height dashed vertical hairlines
  (2px dash / 2px gap) at both column edges. All at hairline weight,
  ~16px insets.
- No full-page dot matrix — texture comes from grain, structure from guides.
- Everything in this layer is `pointer-events: none`, `user-select: none`,
  and must be missable: noticed on the second visit, not the first.

## Micro-interaction craft

Few interactions, disproportionate care:

- Buttons: `transform: scale(0.97)` on `:active`, 100ms. 44px minimum hit
  area (pseudo-element if visually smaller).
- Copy buttons on every code block; copied state swaps icon for 1.5s with no
  layout shift (fixed-width slot).
- Anchored headings scroll with `scroll-margin-top` matching the nav height.
- Icon-only controls always carry `aria-label`. Tabbing reaches only visible
  elements; keyboard focus scrolls into view.
- Skeletons and dynamic slots have hardcoded dimensions — zero layout shift
  is a feature gate for merging.

## Illustration accents

Diagrams and decorative accents use a hand-drawn technical style: inline SVG,
stroke widths in the 1.35–1.8 range, `stroke-linecap="round"`, slight waver,
no fills or flat-vector look. Labels use a dedicated annotation face (the
handwriting-feel font), not the body font. Strokes may draw themselves on
first view (path-draw animation with tapered ends, ~0.5–1.25s), respecting
reduced motion. Decorative instances set `role="img"` + `aria-label` (or
`aria-hidden` if truly ornamental), `user-select: none`,
`pointer-events: none`. Used sparingly, mostly inside posts.

## Static by default

Blog, feeds, and OG images are statically generated; interactive data (hover
cards, now-playing) revalidates on ISR timers. Fonts are preloaded (except
the CJK fallback, which loads on demand); above-the-fold images get
`rel="preload"`. Page scrollbars are never customized; code-block scrollbars
may be.
