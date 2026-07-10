# v2 Design Language

The visual and interaction spec for cali.so v2. It extends the component stack
in ADR-0006 (motion is information, not decoration). Rules here are written to
be buildable: when a value is stated, use it; when a component is described,
its behavior spec is the contract.

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
- No scroll-triggered animation anywhere: no fade-ups on scroll, no parallax,
  no scroll hijacking. Content is simply there when you arrive.
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
- **Prose is the exception.** Post bodies are 17px/1.7 with CJK line-height
  1.9 (16px minimum everywhere also prevents iOS input zoom); post titles may
  be large. Headings use `text-wrap: balance` and tighter letter-spacing as
  size grows.
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

## Hover cards as craft objects

Inline mentions of external presences (social profile, code, films, music)
open rich hover cards. The contract:

- **Per-service design.** Each card is composed for its service — no generic
  "avatar + handle" template. The card's *content* also animates, not just
  its container:
  - Code card: a real contribution graph (~52 week columns, hairline 0.5px
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

## Selective focus

The governing attention grammar: **only the thing being attended to is
sharp.** Applications:

- **List rows (writing index, home list)**: hovering a row blurs (~4–6px) and
  dims everything else on the page over ~200ms `--ease-swift`; mouse-out
  restores instantly. The hovered row itself does not move.
- **Media loading**: images/video in card grids sit as blur-up placeholders
  and resolve to sharp when loaded or attended.
- Focus-pull requires `@media (hover: hover) and (pointer: fine)` and is
  fully disabled under `prefers-reduced-motion` (no blur transitions —
  content stays sharp).

## Fluid page transitions

Index → post navigation continues the selective-focus grammar: the origin
page defocuses (the hovered row already sharp), and the post rises over that
blurred backdrop — cover and title morphing as shared elements over 300–350ms
`--ease-swift`; the rest crossfades. Post pages may open as a staged title
card (title + date settle first, content follows). Browsers without view
transitions get instant navigation — no JS fallback animation. Reduced motion
disables all of it. Transitions never delay navigation: content is statically
generated, and the transition plays over already-available content.

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
