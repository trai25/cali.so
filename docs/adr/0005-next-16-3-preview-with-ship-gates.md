# Ship on an exact reviewed Next.js 16.3 preview

## Status

Accepted as the v3.0 release decision. The historical `v2` integration-branch
name is superseded by ADR-0010, and the production cutover completed on July
20, 2026. The exact-pin and preview-update gates remain in force.

v3 was developed on the historically named `v2` integration branch and shipped
on an exact reviewed Next.js 16.3 preview instead of waiting for a stable
release. Floating preview or canary ranges remain prohibited.

Every preview update requires explicit review, an exact package and lockfile
change, a known-advisory check, and the complete validation suite. The agreed
release pin is `16.3.0-preview.6`, adopted in the Cache Components baseline
issue rather than as an incidental documentation update.

Production cutover was gated on both:

1. completing the full issue #91 rollout: Cache Components, route-by-route
   Instant Navigations, and Partial Prefetching;
2. verifying 100% of the checked-in legacy URL manifest against a production
   build and production-like Preview, not spot checks.

The site's indexed URLs are its most valuable asset. Framework preview status
does not relax the route, cache, privacy, or release-evidence requirements.
