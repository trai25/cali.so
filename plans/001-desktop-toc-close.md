# 001 - Let the desktop TOC finish closing

- **Status**: DONE
- **Commit**: cae8fbc
- **Severity**: MEDIUM
- **Category**: Interruptibility / easing and duration
- **Estimated scope**: 2 files, about 30 lines

## Problem

The desktop document map starts a per-node Motion exit, but the containing
`nav` becomes `visibility: hidden` in the same render that starts the exit. The
browser therefore conceals the rail before the stagger, upward settle, and tiny
rotation can be seen. At a 1440×900 viewport, the first frame after pressing the
close control reports `visibility: hidden` while Motion is already applying an
exit transform to the first node.

`components/post-toc.tsx:74` currently starts the intended exit and immediately
removes the open state:

```tsx
// components/post-toc.tsx:74 - current
const animation = animate(
  items,
  {
    opacity: nextOpen ? 1 : 0,
    transform: nextOpen
      ? 'translateY(0) rotate(0deg)'
      : 'translateY(-8px) rotate(2deg)',
  },
  {
    duration: nextOpen ? 0.26 : 0.2,
    delay: stagger(nextOpen ? 0.012 : 0.01, { from: 'center' }),
    ease: [0.23, 0.88, 0.26, 0.92],
  },
)
nodeAnimationRef.current = animation
flushSync(() => setOpen(nextOpen))
```

`app/globals.css:2562` makes that state change visually terminal because
`visibility` has no exit delay:

```css
/* app/globals.css:2562 - current */
.post-minimap {
  opacity: 0;
  visibility: hidden;
  transition: opacity 200ms ease;
}

.post-minimap-root[data-open] .post-minimap {
  opacity: 1;
  visibility: visible;
  pointer-events: auto;
}
```

The close is occasional UI chrome, so a short exit is useful for spatial
continuity. It should stay below 300ms, start immediately, preserve the fixed
x-position, remain interruptible, and disappear from interaction and assistive
technology as soon as the user closes it.

## Target

Only the ≥64rem desktop close changes. Keep the existing center-out exit,
`translateY(-8px) rotate(2deg)`, and zero x-axis movement. Make the visible exit
last at most 260ms:

- Node duration: `200ms`.
- Maximum center-out stagger window: `60ms`, regardless of node count.
- Exit easing: the repo's `--ease-swift` curve represented for Motion as
  `[0.2, 0.8, 0.2, 1]`.
- Container concealment: `280ms`, providing a 20ms buffer after the longest
  node exit.
- `aria-expanded="false"`, `aria-hidden="true"`, `inert`, and pointer blocking
  still update immediately when close is pressed. Only visual `visibility` is
  delayed.
- Opening, tablet, and phone timing remain unchanged.

Add a bounded desktop exit step in `components/post-toc.tsx`:

```tsx
// target constants, beside the existing component constants
const DESKTOP_EXIT_DURATION = 0.2
const DESKTOP_EXIT_STAGGER_WINDOW = 0.06
const EASE_SWIFT = [0.2, 0.8, 0.2, 1] as const

// target logic inside animateOpenState, after items is resolved
const closingDesktop = desktop && !nextOpen
const furthestCenterIndex = Math.ceil((items.length - 1) / 2)
const desktopExitStagger =
  furthestCenterIndex > 0
    ? Math.min(0.01, DESKTOP_EXIT_STAGGER_WINDOW / furthestCenterIndex)
    : 0

if (closingDesktop) {
  for (const item of items) {
    const style = window.getComputedStyle(item)
    item.style.opacity = style.opacity
    item.style.transform = style.transform
  }
}

const animation = animate(
  items,
  {
    opacity: nextOpen ? 1 : 0,
    transform: nextOpen
      ? 'translateY(0) rotate(0deg)'
      : 'translateY(-8px) rotate(2deg)',
  },
  {
    duration: closingDesktop ? DESKTOP_EXIT_DURATION : nextOpen ? 0.26 : 0.2,
    delay: stagger(
      closingDesktop ? desktopExitStagger : nextOpen ? 0.012 : 0.01,
      { from: 'center' },
    ),
    ease: closingDesktop ? EASE_SWIFT : [0.23, 0.88, 0.26, 0.92],
  },
)
```

Delay only the desktop visual concealment in `app/globals.css`. The zero-duration
opacity transition keeps the container fully visible while its children exit;
the nodes themselves provide the fade.

```css
/* target, after the base open-state rule */
@media (min-width: 64rem) {
  .post-minimap {
    transition:
      opacity 1ms linear 279ms,
      visibility 1ms linear 279ms;
  }

  .post-minimap-root[data-open] .post-minimap {
    transition: opacity 200ms var(--ease-swift);
  }
}
```

Use a 1ms duration after a 279ms delay rather than a zero-duration delayed
transition. Lightning CSS removes the latter as a no-op, which would restore
the original immediate concealment bug in the compiled stylesheet.

Do not delay `pointer-events`, `aria-hidden`, or `inert`. The closing rail must
look present briefly without remaining actionable.

Pin the rendered node opacity and transform before starting a desktop close.
Motion captures implicit CSS start values lazily; without this pin, the first
close after mounting can capture the newly applied closed CSS state after
`flushSync`, while later closes work only because Motion has left inline values.

## Repo conventions to follow

- Motion tokens live in `app/globals.css:230`; `--ease-swift` is
  `cubic-bezier(0.2, 0.8, 0.2, 1)` and is the documented curve for UI chrome.
- `docs/design-language.md:25` assigns UI chrome 150–200ms with no bounce, and
  `docs/design-language.md:50` restricts motion to transform and opacity.
- `components/post-toc.tsx:67` already stops the previous Motion animation
  before starting another. Preserve that interruptibility and reuse the existing
  `nodeAnimationRef` cleanup.
- `app/globals.css:2948` already removes all minimap transitions under
  `prefers-reduced-motion`. Keep that override later in source order.

## Steps

1. In `components/post-toc.tsx`, add the three exact desktop-exit constants
   shown above near `DESKTOP_QUERY`.
2. In `animateOpenState`, derive `closingDesktop`, pin each node's current
   rendered opacity and transform before the desktop close, cap the center-out
   stagger to a total `60ms` window, and use the target duration/easing only for
   desktop close. Leave opening and non-desktop branches byte-for-byte
   equivalent in behavior.
3. In `app/globals.css`, add the ≥64rem transition override shown above after
   `.post-minimap-root[data-open] .post-minimap` and before the node rules.
   Do not change position, width, or x-axis transforms.
4. Confirm that the existing reduced-motion block remains later in the cascade
   and still sets the affected transitions to `none`.

## Boundaries

- Do NOT change the mobile island or the 40–63.99rem tablet rail.
- Do NOT change the desktop TOC layout, tick spacing, labels, scroll behavior,
  active state, or toggle SVG paths.
- Do NOT move the rail or article on the x-axis.
- Do NOT defer `setOpen(false)` or its ARIA/inert updates until animation end.
- Do NOT add dependencies or use native View Transitions.
- Do NOT modify unrelated footer, shelf, sound, post-opening, or minimap work in
  the dirty working tree.
- If these cited structures have drifted from commit `cae8fbc`, STOP and report
  the mismatch instead of improvising.

## Verification

- **Mechanical**: run `pnpm typecheck` and `git diff --check`; both must exit 0.
- **Feel check**: run the existing preview at `http://localhost:3002`, open
  `/blog/an-ode-to-hao-chen`, and test at 1440×900:
  - Press the desktop close control. The center items should begin fading and
    settling upward immediately, with the outer items following within 60ms.
  - The whole rail must remain at the same x-coordinate throughout.
  - At 10% playback speed in DevTools, the rail must stay `visibility: visible`
    while nodes exit, then become hidden only after every node reaches opacity
    zero. There must be no final-frame flash when Motion cancels its inline
    styles.
  - Toggle closed then open repeatedly. The motion must retarget without a
    stale invisible rail, stuck inline transform, or delayed reopen.
  - Immediately after pressing close, verify `aria-expanded="false"`, the nav
    has `aria-hidden="true"` and `inert`, and it cannot receive pointer or
    keyboard input even though the exit remains visible.
  - Emulate `prefers-reduced-motion: reduce`. Close must be immediate with no
    stagger, translation, rotation, or fade.
  - Recheck at 1023px and 393px widths. Their current close timing and island
    behavior must be unchanged.
- **Done when**: desktop close visibly completes its bounded center-out exit in
  no more than 280ms, the rail and article never move horizontally, semantics
  close immediately, rapid reversal is clean, and reduced motion is instant.
