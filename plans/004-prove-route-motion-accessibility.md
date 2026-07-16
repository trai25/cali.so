# 004 - Prove route motion accessibility in the browser

- **Status**: DONE
- **Commit**: f08aa6c
- **Severity**: MEDIUM
- **Category**: Accessibility
- **Estimated scope**: 1 file, about 100 lines

## Problem

The stylesheet correctly disables View Transition pseudo-element timing for
reduced motion:

```css
/* app/globals.css:1524 - current */
::view-transition-group(*),
::view-transition-image-pair(*),
::view-transition-old(*),
::view-transition-new(*) {
  animation-duration: 0s !important;
  animation-delay: 0s !important;
}
```

But the browser regression in `e2e/instant-navigation.spec.ts:203` only checks
an entrance class and the Preferences control:

```ts
// e2e/instant-navigation.spec.ts:217 - current
await expect
  .poll(() => page.evaluate(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches))
  .toBe(true)
await expect
  .poll(() => page.locator('.enter').first().evaluate((element) => getComputedStyle(element).animationName))
  .toBe('none')
```

It never opens a post under reduced motion and never inspects the route,
cover, or title pseudo-groups. Likewise,
`components/post-transition-link.test.tsx:77` proves that keyboard activation
clears two CSS variables in jsdom, but no browser test proves that the actual
React/Next View Transition is instant.

These are the two highest-risk boundaries because CSS pseudo-element behavior,
React View Transition activation, Next navigation, and input modality only
meet in a real browser.

## Target

Extend `e2e/instant-navigation.spec.ts` with reusable pseudo-style sampling and
two browser regressions after plans 002 and 003 are implemented.

Add this helper near `observeCoverMorph`:

```ts
// e2e/instant-navigation.spec.ts - target
type ViewTransitionTiming = {
  animationDelay: string
  animationDuration: string
  animationName: string
}

async function viewTransitionTiming(
  page: import('@playwright/test').Page,
  pseudo: string,
) {
  return page.locator('html').evaluate((element, pseudoElement) => {
    const style = getComputedStyle(element, pseudoElement)
    return {
      animationDelay: style.animationDelay,
      animationDuration: style.animationDuration,
      animationName: style.animationName,
    }
  }, pseudo) as Promise<ViewTransitionTiming>
}
```

Add a keyboard regression that:

1. Opens `/blog`, focuses the known covered post row, and presses Enter.
2. Asserts the destination URL and localized article status/content.
3. Asserts `<html data-route-motion="none">` remains present.
4. Asserts `--post-cover-transition-name` and
   `--post-title-transition-name` are empty.
5. Asserts the computed `animationDuration` and `animationDelay` are `0s` for:
   - `::view-transition-old(root)`
   - `::view-transition-new(root)`
   - `::view-transition-old(.route-content)`
   - `::view-transition-new(.route-content)`
   - `::view-transition-group(cover-p01)`
   - `::view-transition-group(title-p01)`

Add a reduced-motion pointer regression that:

1. Calls `page.emulateMedia({ reducedMotion: 'reduce' })` before visiting
   `/en/blog`.
2. Pointer-clicks the same covered post so
   `data-route-motion="none"` is removed. This isolates the media query as the
   reason motion is disabled.
3. Asserts the English loading shell and final article appear.
4. Asserts `matchMedia('(prefers-reduced-motion: reduce)').matches` is true.
5. Asserts the same six pseudo-elements report `animationDuration: '0s'` and
   `animationDelay: '0s'`.

Also extend the existing positive pointer test to prove the chrome/content
split after plan 003:

```ts
expect((await viewTransitionTiming(page, '::view-transition-old(root)')).animationName)
  .toBe('none')
expect((await viewTransitionTiming(page, '::view-transition-old(.route-content)')).animationName)
  .toContain('vt-defocus')
expect((await viewTransitionTiming(page, '::view-transition-new(.route-content)')).animationName)
  .toContain('vt-focus')
```

Sample the positive transition immediately after the pre-click observer is
armed, as the existing `observeCoverMorph` helper does. Do not start a polling
loop on page load; that was the Greptile race fixed in commit `f08aa6c`.

## Repo conventions to follow

- `e2e/instant-navigation.spec.ts:15-51` already samples a named pseudo-group
  and stores only diagnostic state on `window`. Extend that pattern rather than
  adding screenshots or arbitrary sleeps.
- Use `instant(page, async () => { ... })` around the navigation so Next's
  Partial Prefetching fixture exposes the localized loading shell deterministically.
- `postSlug` and the allowlisted transition names make the expected groups
  deterministic: `cover-p01` and `title-p01`.
- Existing Chinese and English positive pointer cases must remain. New
  accessibility cases supplement them; they do not replace positive morph
  coverage.
- The repository's reduced-motion contract intentionally uses `0s`, not a
  gentler opacity fallback.

## Steps

1. Add the exact `ViewTransitionTiming` type and `viewTransitionTiming` helper
   near the existing morph observer.
2. Add the keyboard-activation browser test on `/blog`, using focus + Enter
   rather than `click({ detail: 0 })`. Assert the input-modality attribute,
   empty shared-name variables, localized shell/final article, and zero timing
   for all six pseudo-elements.
3. Add the English reduced-motion pointer test. Prove the post-link pointer
   path removed the document opt-out before attributing zero timing to the
   media query.
4. Extend one existing positive pointer morph test with the static-root and
   route-content animation-name assertions. Keep the observer immediately
   before the click.
5. Run each new test repeatedly enough to expose timing races. If pseudo-style
   reads can miss the positive animation, integrate them into the existing
   requestAnimationFrame observer rather than adding `waitForTimeout`.

## Boundaries

- Do NOT change production source in this plan; plans 002 and 003 own behavior.
- Do NOT use fixed sleeps, screenshots as assertions, or network-idle as proof
  that an animation ran.
- Do NOT assert undocumented generated React View Transition names. Assert the
  stable class `.route-content` and allowlisted cover/title names only.
- Do NOT remove the existing Chinese or English pointer-morph tests.
- Do NOT loosen the loading-shell assertions or prefetch contract.
- Do NOT modify the 250ms, 300ms, or 320ms production timings.
- If plans 002 and 003 are not complete, or the cited structures have drifted
  from commit `f08aa6c`, STOP and report instead of improvising.

## Verification

- **Mechanical**: run `NEXT_INSTANT_NAVIGATION_TEST=1 pnpm exec next build`,
  then
  `pnpm exec playwright test e2e/instant-navigation.spec.ts --grep "keyboard|reduced motion|morphs from" --repeat-each=3`.
  Follow with `pnpm exec playwright test e2e/instant-navigation.spec.ts`,
  `pnpm typecheck`, and `git diff --check`; every command must exit 0. The
  repeated focused run must expose observer races without rebuilding between
  repetitions.
- **Feel check**:
  - At 10% playback, pointer-open the covered post and confirm the static root,
    250/300ms route-content focus, and 320ms cover/title morph match the
    assertions.
  - Focus the row and press Enter. The page must swap with no visible fade,
    blur, cover movement, or title movement.
  - Emulate reduced motion and pointer-open the row. The result must also be an
    immediate swap even though the post-pointer path is otherwise eligible for
    motion.
  - Repeat Chinese and English cases in Chromium. Verify unsupported View
    Transition browsers still navigate without a JS fallback animation.
- **Done when**: browser tests prove pointer motion remains positive, keyboard
  and reduced-motion navigation are instant at every pseudo-group, global
  chrome stays static, and the focused test is race-free across three runs.

## Completion

Completed on `cali/fix-instant-post-navigation` with stronger browser proof than
the original pseudo-style proposal. The suite observes real `Animation`
lifecycles by `KeyframeEffect.pseudoElement`, holds the localized loading shell
with `instant()`, awaits the exact stage-one cover animations' `finished`
promises, and rearms before proving shell -> article independently. It covers
Chinese, English, keyboard, reduced motion, browser Back, and a real `hasTouch`
tap without fixed sleeps.
