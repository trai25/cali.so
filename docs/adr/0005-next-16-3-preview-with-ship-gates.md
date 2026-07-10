# Build on Next.js 16.3 preview; prod cutover is double-gated

v2 is developed on the Next.js 16.3 preview line on the long-lived `v2` branch, but shipping to prod is gated on two conditions: (1) the release line reaching stable, and (2) 100% verification of the existing public URL surface against a crawled list of live v1 URLs (issue #75) — not spot checks. The site's indexed URLs are its most valuable asset, so the framework doing the routing and redirects must be stable before cutover, even if v2 is otherwise done.
