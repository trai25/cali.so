# 002 - Limit route motion to pointer-opened posts

- **Status**: DONE
- **Commit**: f08aa6c
- **Severity**: HIGH
- **Category**: Purpose and frequency
- **Estimated scope**: 5 files, about 100 lines

## Problem

The public document wraps every route body in one always-active React View
Transition. Next.js route navigations are React transitions, so this boundary
activates for keyboard navigation, dock navigation, ordinary links, and post
links alike.

`app/_components/site-document.tsx:58` currently has no transition-type or
input-modality gate:

```tsx
// app/_components/site-document.tsx:58 - current
<main className="flex-1 pt-14">
  {/* Intentionally untyped: post covers and titles morph through
      list → loading shell → article. default="none" suppresses
      those CSS-named groups in this React/Next version. */}
  <ViewTransition>{children}</ViewTransition>
</main>
```

`components/post-transition-link.tsx:31` removes shared-element identities for
a keyboard-generated click, but it cannot stop the route/root animation:

```tsx
// components/post-transition-link.tsx:31 - current
const root = document.documentElement
if (event.detail === 0) {
  root.style.removeProperty('--post-cover-transition-name')
  root.style.removeProperty('--post-title-transition-name')
  return
}
```

The result violates `docs/design-language.md:51`: keyboard-initiated actions
must never animate, and high-frequency navigation must not gain an entrance
animation. The only route animation justified here is the pointer/touch post
handoff, where the cover and title communicate that the selected row became
the article.

## Target

Default every route transition to instant. Enable the existing staged
transition only when a primary unmodified pointer activates a
`PostTransitionLink`.

Use one persistent document attribute:

```html
<html data-route-motion="none">
```

Use one marker on post links:

```tsx
<Link data-post-transition-link ... />
```

Add a client-only capture controller with this exact behavior:

```tsx
// components/route-motion-controller.tsx - target
'use client'

import { useEffect } from 'react'

const POST_LINK_SELECTOR = '[data-post-transition-link]'
const ROUTE_MOTION_ATTRIBUTE = 'data-route-motion'

export function RouteMotionController() {
  useEffect(() => {
    const root = document.documentElement

    function disableRouteMotion() {
      root.setAttribute(ROUTE_MOTION_ATTRIBUTE, 'none')
    }

    function preparePointerRoute(event: PointerEvent) {
      const target = event.target
      const opensPost =
        event.isPrimary &&
        event.button === 0 &&
        !event.metaKey &&
        !event.ctrlKey &&
        !event.shiftKey &&
        !event.altKey &&
        target instanceof Element &&
        target.closest(POST_LINK_SELECTOR) !== null

      if (opensPost) {
        root.removeAttribute(ROUTE_MOTION_ATTRIBUTE)
      } else {
        disableRouteMotion()
      }
    }

    document.addEventListener('pointerdown', preparePointerRoute, true)
    document.addEventListener('keydown', disableRouteMotion, true)

    return () => {
      document.removeEventListener('pointerdown', preparePointerRoute, true)
      document.removeEventListener('keydown', disableRouteMotion, true)
    }
  }, [])

  return null
}
```

The controller intentionally uses capture phase. It must classify the input
before Next starts navigation from the target link. Pointer and touch post
activation remove the opt-out and preserve both stages of the current
list-to-shell-to-article transition. Keyboard, dock, settings, ordinary links,
modified clicks, and non-primary pointers leave route motion disabled.

Add this exact CSS gate alongside the existing reduced-motion gate:

```css
/* app/globals.css - target */
html[data-route-motion='none']::view-transition-group(*),
html[data-route-motion='none']::view-transition-image-pair(*),
html[data-route-motion='none']::view-transition-old(*),
html[data-route-motion='none']::view-transition-new(*) {
  animation-duration: 0s !important;
  animation-delay: 0s !important;
}
```

Do not type the outer `ViewTransition` with `default="none"`. In Next.js
16.3.0-preview.6, that suppresses the CSS-named cover/title groups and breaks
the second Suspense handoff. The document attribute controls duration without
deactivating the React boundary.

## Repo conventions to follow

- `docs/design-language.md:51-60` is the authority: keyboard and high-frequency
  navigation are instant, pointer post links may morph, and reduced motion is
  instant.
- `components/post-transition-link.tsx:19-39` already distinguishes normal
  primary clicks from keyboard and modified clicks. Preserve those native-link
  guards.
- `app/globals.css:1504-1530` already uses `0s !important` for reduced-motion
  View Transition pseudo-elements. Reuse that exact mechanism.
- `components/locale-restorer.tsx` is the existing pattern for a client-only
  document controller rendered by the server-owned `SiteDocument`.
- The public route transition uses CSS and the browser View Transition
  compositor. Do not introduce Framer Motion, Motion, GSAP, or timers.

## Steps

1. Add `components/route-motion-controller.tsx` with the exact capture-phase
   controller above. It must return `null` and clean up both listeners.
2. In `app/_components/site-document.tsx`, add
   `data-route-motion="none"` to `<html>` and render
   `<RouteMotionController />` inside `ThemeProvider`, before the route body.
   This default also keeps admin route changes instant because admin shares
   `SiteDocument` and has no post-transition links.
3. In `components/post-transition-link.tsx`, add the boolean
   `data-post-transition-link` attribute to the existing `Link`. Do not replace
   `Link` with `router.push`; native modified-click and new-tab behavior must
   remain owned by Next/the browser.
4. Add `components/route-motion-controller.test.tsx` in jsdom. Prove that an
   unmodified primary-button pointerdown inside a marked post link removes the
   document attribute; an ordinary, modified, or non-primary pointerdown
   restores `none`; and a keydown restores `none`. Verify unmount removes the
   listeners.
5. Extend `components/post-transition-link.test.tsx` to assert the rendered
   anchor carries `data-post-transition-link` while retaining the existing
   pointer, keyboard, and modified-click assertions.
6. Add the exact CSS opt-out after the base View Transition rules and before
   the existing `prefers-reduced-motion` block. Do not remove the reduced-motion
   block; the two gates protect different inputs.

## Boundaries

- Do NOT change the 250ms defocus, 300ms focus, or 320ms shared morph.
- Do NOT add `default="none"` to the outer React `ViewTransition`.
- Do NOT change Partial Prefetching or force `prefetch={true}`.
- Do NOT intercept navigation with `preventDefault`, `router.push`, timers, or
  a custom history implementation.
- Do NOT animate keyboard, dock, settings, language, theme, admin, or ordinary
  content links.
- Do NOT change cover/title identity generation or the loading shell.
- Do NOT add a dependency.
- If the cited structures have drifted from commit `f08aa6c`, STOP and report
  the mismatch instead of improvising.

## Verification

- **Mechanical**: run `pnpm typecheck`,
  `pnpm vitest run components/route-motion-controller.test.tsx components/post-transition-link.test.tsx`,
  and `git diff --check`; all must exit 0.
- **Feel check**: run a production build in a browser and confirm:
  - Pointer-click or touch-tap a covered post row. The cover and title still
    morph list -> localized loading shell -> article.
  - Focus the same row and press Enter. Navigation is immediate; neither the
    route, cover, nor title animates.
  - Click dock destinations, language/theme settings, and ordinary links.
    Their route content swaps immediately without a page entrance.
  - Command/Control-click and middle-click remain native and open a new tab or
    window without changing the current page.
  - In DevTools at 10% playback, only a primary pointer/touch post activation
    produces route/shared groups with non-zero duration.
  - With `prefers-reduced-motion: reduce`, pointer post navigation is also
    instant.
- **Done when**: only primary pointer/touch post activation enables route
  animation; all keyboard and routine navigation is instant, native link
  semantics remain intact, and the two-stage post morph is unchanged.

## Completion

Completed on `cali/fix-instant-post-navigation`. Review strengthened the plan's
input lifetime: eligible `pointerdown` only preserves the disabled state, while
the validated post-link `click` enables motion. `popstate`, keyboard, modified
or non-primary pointers, and ordinary links restore instant navigation. A
client `RouteViewTransition` uses React's `onUpdate` completion cleanup to keep
the list -> shell stage active and reset the opt-in only after shell -> article
finishes. This also prevents canceled touch gestures and browser Back from
inheriting motion.
