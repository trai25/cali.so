# v2 Design Language

The visual and interaction spec for cali.so v2. It extends the component stack
in ADR-0006 (motion is information, not decoration). Rules here are written to
be buildable: when a value is stated, use it; when a component is described,
its behavior spec is the contract.

## Motion system

Token set (define in `globals.css`, use everywhere — no ad-hoc cubic-beziers):

```css
--ease-out-quart: cubic-bezier(0.165, 0.84, 0.44, 1);   /* enter/exit         */
--ease-in-out-quart: cubic-bezier(0.77, 0, 0.175, 1);   /* on-screen movement */
--ease: ease;                                            /* hover/color        */
```

| Motion | Duration | Easing |
| --- | --- | --- |
| Hover/color change | 150ms | `ease` |
| Tooltip, dropdown, hover card enter | 150–200ms | `--ease-out-quart` |
| Exit (any) | ~2/3 of its enter | `--ease-out-quart` |
| Shared-element page transition | 300–350ms | `--ease-in-out-quart` |

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
- Body text is 16px minimum (also prevents iOS input zoom); post prose is
  17px/1.7 with CJK line-height 1.9. Headings use `text-wrap: balance` and
  tighter letter-spacing as size grows (pair size and tracking inside one
  `<Text>`/prose style, per font).
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

- **Per-service design.** Each card is composed for its service — a code card
  shows the contribution graph, a films card shows recent poster art with
  ratings, a music card shows the current/last track with artwork. No generic
  "avatar + handle" template.
- **Behavior.** 300ms open intent delay (0ms when moving between adjacent
  triggers), enter 200ms `--ease-out-quart` from `scale(0.95)` + `opacity: 0`,
  `transform-origin` at the trigger. Exit faster than enter. Built on the
  fluid hover-card primitive so pointer exit mid-animation reverses smoothly.
- **Fixed dimensions per card type** — content loads into a fixed-size card
  (skeleton first), never resizing after open. No layout shift, ever.
- **Touch fallback.** Hover cards require `@media (hover: hover) and (pointer:
  fine)`. On touch, the trigger is a plain link to the destination — the card
  is an enhancement, not the content.
- **Data at build time.** Card data (grid, films, tracks) is fetched at build
  / ISR, not on hover; an open card never spinners on network.

## Fluid page transitions

Index → post navigation uses the View Transitions API (Next's built-in
support): the cover image and title are shared elements morphing over
300–350ms `--ease-in-out-quart`; the rest crossfades. Browsers without view
transitions get instant navigation — no JS fallback animation. Reduced motion
disables the morph entirely. Transitions never delay navigation: content is
statically generated, and the transition plays over already-available content.

## Instant-photo cover treatment

Post covers render as instant-print photographs:

- White frame: 4% of width on three sides, 14% at the bottom; bottom edge
  carries an optional caption/date in a small handwriting-feel face.
- In listings: deterministic tilt of −2° to 2° derived from the slug (stable
  across builds), straightening to 0° on hover — 200ms `--ease-in-out-quart`,
  `@media (hover: hover)` only.
- Shadow: two-layer, e.g. `0 1px 2px rgb(0 0 0 / 0.06), 0 8px 24px
  rgb(0 0 0 / 0.10)`, deepening slightly on hover with the same timing as the
  straighten.
- The same treatment renders the OG image, so a shared post is recognizably
  the same object.
- The frame is a component (`PolaroidCover`), not per-post CSS.

## Ambient background

A fixed dot grid behind content: 24px cell, 1px dots, `--gray-1`-relative
opacity around 5% in light and 8% in dark (tune per screen, not per
component). Hairline rule lines may mark layout columns on wide viewports.
Always `pointer-events: none`, `user-select: none`, masked out with
`mask-image` behind dense text areas. It should be missable — noticed on the
second visit, not the first.

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

Diagrams and decorative accents use a hand-drawn technical style: thin
strokes, slight waver, no fills or flat-vector look. Decorative instances set
`role="img"` + `aria-label` (or `aria-hidden` if truly ornamental),
`user-select: none`, `pointer-events: none`. Used sparingly, mostly inside
posts.

## Static by default

Blog, feeds, and OG images are statically generated; interactive data (hover
cards, now-playing) revalidates on ISR timers. Fonts are preloaded (except
the CJK fallback, which loads on demand); above-the-fold images get
`rel="preload"`. Page scrollbars are never customized; code-block scrollbars
may be.
