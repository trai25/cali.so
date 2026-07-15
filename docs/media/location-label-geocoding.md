# Media Location Label geocoding

Location Label suggestions are an optional owner-only Media Library feature.
They are disabled unless `MEDIA_GEOCODING_ENABLED=true` and a server-restricted
`GOOGLE_MAPS_GEOCODING_API_KEY` is present.

The application decrypts a Media Asset's private Capture Location only after
the owner requests a suggestion. It sends the coordinates directly to the
fixed Google Maps Geocoding endpoint once for Simplified Chinese and once for
English. It returns only the first formatted label for each available locale.
Raw provider responses, coordinates, and provider errors are not stored or
included in public projections, client bundles, logs, or audit records.

Before production enablement, restrict the key to the Geocoding API and the
deployment's server egress policy, set a project quota and budget alert, and
review Google's retention, regional processing, and incident terms. Missing
GPS, missing locale results, timeouts, and provider failures never block Media
Asset readiness or manual Location Label editing.
