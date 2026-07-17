# Build on an exact reviewed Next.js 16.3 preview; cutover remains gated

v3 is developed on the historically named `v2` integration branch. It may
ship on an exact reviewed Next.js 16.3 preview instead of waiting for a stable
release, but floating preview or canary ranges are prohibited.

Every preview update requires explicit review, an exact package and lockfile
change, a known-advisory check, and the complete validation suite. The agreed
release pin is `16.3.0-preview.6`, adopted in the Cache Components baseline
issue rather than as an incidental documentation update.

Production cutover is gated on both:

1. completing the full issue #91 rollout: Cache Components, route-by-route
   Instant Navigations, and Partial Prefetching;
2. verifying 100% of the checked-in legacy URL manifest against a production
   build and production-like Preview, not spot checks.

The site's indexed URLs are its most valuable asset. Framework preview status
does not relax the route, cache, privacy, or release-evidence requirements.
