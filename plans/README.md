# Archived animation plans

Plans 001 through 003 are completed implementation records. New work is tracked
in GitHub Issues, which is the repository's canonical planning surface.

| # | Plan | Severity | Status |
| --- | --- | --- | --- |
| 001 | [Let the desktop TOC finish closing](001-desktop-toc-close.md) | MEDIUM | DONE |
| 002 | [Limit route motion to pointer-opened posts](002-limit-route-motion-to-post-pointers.md) | HIGH | DONE |
| 003 | [Keep global chrome fixed during post transitions](003-keep-global-chrome-fixed.md) | MEDIUM | DONE |
| 004 | Prove route motion accessibility in the browser | MEDIUM | RETIRED |

## Recommended execution order

Plan 001 is complete.

Plans 002 and 003 were completed in this order:

1. **002** establishes the input-modality contract: only primary pointer/touch
   post navigation may animate.
2. **003** depends on 002 and moves the settled route focus treatment from the
   document root to route content while keeping global chrome fixed.

Plan 004 and its original Playwright suite were removed in `932d321`. The
current browser release gate was introduced separately in PR #193 and lives in
`tests/browser/`; it is not the deleted plan 004 suite.
