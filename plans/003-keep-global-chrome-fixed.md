# 003 - Keep global chrome fixed during post transitions

- **Status**: DONE
- **Commit**: f08aa6c
- **Severity**: MEDIUM
- **Category**: Cohesion
- **Estimated scope**: 2 files, about 30 lines

## Problem

The route focus treatment is attached to the browser's `root` View Transition
snapshot:

```css
/* app/globals.css:1423 - current */
::view-transition-old(root) {
  animation: vt-defocus 250ms var(--ease-swift) both;
}

::view-transition-new(root) {
  animation: vt-focus 300ms var(--ease-swift) both;
}
```

`root` contains more than the changing route. In
`app/_components/site-document.tsx:54-68`, the ambient background, footer, and
dock sit outside the React boundary but remain part of the document snapshot:

```tsx
// app/_components/site-document.tsx:54 - current
<ThemeProvider>
  {restoreLocale && <LocaleRestorer />}
  <AmbientBackground />
  <div className="flex min-h-screen flex-col pb-20">
    <main className="flex-1 pt-14">
      <ViewTransition>{children}</ViewTransition>
    </main>
    <SiteFooter social={social} github={github} locale={locale} />
  </div>
  <Suspense fallback={<DockFallback locale={locale} />}>
    <Dock />
  </Suspense>
</ThemeProvider>
```

Blurring and fading the `root` snapshot therefore makes the spatial anchors
participate in the route change. That contradicts
`docs/design-language.md:56`: ambient guides, the dock, footer, and other
global chrome must remain fixed while only route content defocuses and focuses.

## Target

Keep the React boundary active and give its automatically managed group the
stable View Transition class `route-content`:

```tsx
// app/_components/site-document.tsx - target
<ViewTransition default="route-content">{children}</ViewTransition>
```

`default="route-content"` assigns a class to the boundary's active group. It
must not be `default="none"`; the latter deactivates the boundary during the
untyped Suspense reveal and breaks the existing shared cover/title handoff in
this exact Next/React version.

Make the browser root snapshot static, following the fixed-header pattern in
the bundled Next.js 16.3 View Transition guide:

```css
/* app/globals.css - target */
::view-transition-group(root) {
  animation: none;
}

::view-transition-old(root) {
  display: none;
}

::view-transition-new(root) {
  animation: none;
}

::view-transition-old(.route-content) {
  animation: vt-defocus 250ms var(--ease-swift) both;
}

::view-transition-new(.route-content) {
  animation: vt-focus 300ms var(--ease-swift) both;
}
```

The old root snapshot is hidden so identical old/new chrome cannot
double-expose or flash. The live/new root remains static. Only the named route
content receives the documented opacity + 2px blur treatment. Nested
`cover-<id>` and `title-<id>` groups keep the existing 320ms
`--ease-swift` morph through both transitions.

## Repo conventions to follow

- `docs/design-language.md:56-61` requires fixed global chrome and a 2px route
  content focus treatment.
- `app/globals.css:1409-1434` owns the settled `vt-defocus`, `vt-focus`, 250ms,
  300ms, and shared 320ms behavior. Reuse these definitions unchanged.
- `node_modules/next/dist/docs/01-app/02-guides/view-transitions.md` documents
  `default="route-content"`-style View Transition classes and the fixed-header
  pattern of hiding the old snapshot while leaving the new snapshot static.
- The `<ViewTransition>` boundary must stay immediately inside `<main>` so the
  footer and dock remain outside the route-content group.

## Steps

1. In `app/_components/site-document.tsx`, change the bare boundary to
   `<ViewTransition default="route-content">`. Update the adjacent comment to
   state that the non-`none` default isolates route content while keeping the
   CSS-named list -> shell -> article groups active.
2. In `app/globals.css`, replace the `old(root)` and `new(root)` focus
   animations with the exact static-root rules above.
3. Move the unchanged `vt-defocus 250ms` and `vt-focus 300ms` animations onto
   `old(.route-content)` and `new(.route-content)` respectively.
4. Leave `::view-transition-group(*)` at 320ms `--ease-swift`. It continues to
   govern geometry interpolation for the cover/title shared groups; the
   root group's explicit `animation: none` keeps it static.

## Boundaries

- Do NOT move `AmbientBackground`, `SiteFooter`, or `Dock` inside the React
  View Transition boundary.
- Do NOT change the document layout, stacking order, footer, dock, or ambient
  rendering.
- Do NOT replace the settled 2px blur with translation, rotation, or scale.
- Do NOT change the 250ms, 300ms, or 320ms timings or `--ease-swift`.
- Do NOT use `default="none"`, transition types, or a second global boundary in
  this plan.
- Do NOT change the post loading shell or shared transition names.
- Do NOT add dependencies.
- This plan depends on plan 002's input-modality gate. If the cited structures
  have drifted from commit `f08aa6c`, STOP and report instead of improvising.

## Verification

- **Mechanical**: run `pnpm typecheck`, `pnpm test:localization`, and
  `git diff --check`; all must exit 0. Then run the focused public navigation
  cases from `pnpm test:navigation`.
- **Feel check**: at 1440x900 and 393x852, pointer-open a covered post from
  `/blog` and `/en/blog`:
  - In DevTools at 10% playback, the dock, ambient guides, and footer stay
    perfectly fixed and sharp. No duplicate old dock/footer may flash.
  - Only the route content fades through 2px blur; the cover and title remain
    separate morph elements above that handoff.
  - The loading shell -> article transition still runs as the second stage.
  - Inspect pseudo-elements: `old(root)` is not displayed, `new(root)` has no
    animation, `old(.route-content)` runs `vt-defocus` for 250ms, and
    `new(.route-content)` runs `vt-focus` for 300ms.
  - Repeat with `prefers-reduced-motion: reduce`; every group swaps instantly.
- **Done when**: global chrome never blurs, fades, moves, or double-exposes;
  only route content receives the focus treatment; and both shared-element
  stages remain intact.

## Completion

Completed on `cali/fix-instant-post-navigation`. `RouteViewTransition` assigns
the `route-content` class, the document root stays static, and only the route
content uses the settled 250ms/300ms focus treatment. Browser verification
proves both cover handoffs while root old/new groups have no non-zero lifecycle.
