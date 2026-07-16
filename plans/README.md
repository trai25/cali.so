# Animation plans

| # | Plan | Severity | Status |
| --- | --- | --- | --- |
| 001 | [Let the desktop TOC finish closing](001-desktop-toc-close.md) | MEDIUM | DONE |
| 002 | [Limit route motion to pointer-opened posts](002-limit-route-motion-to-post-pointers.md) | HIGH | DONE |
| 003 | [Keep global chrome fixed during post transitions](003-keep-global-chrome-fixed.md) | MEDIUM | DONE |
| 004 | [Prove route motion accessibility in the browser](004-prove-route-motion-accessibility.md) | MEDIUM | DONE |

## Recommended execution order

Plan 001 is complete.

Plans 002 through 004 were completed in this order:

1. **002** establishes the input-modality contract: only primary pointer/touch
   post navigation may animate.
2. **003** depends on 002 and moves the settled route focus treatment from the
   document root to route content while keeping global chrome fixed.
3. **004** depends on 002 and 003. It adds real-browser proof for positive
   pointer motion, keyboard navigation, reduced motion, and fixed chrome.
