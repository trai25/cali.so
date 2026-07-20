# Bunny Media Storage live release gate

The destructive storage contract is isolated in the GitHub Actions workflow
`Media Storage Live Contract`. It is manual, targets the protected
`bunny-media-contract` environment, and requires the exact
`confirmed-non-production` input. The tests also reject zone and hostname names
that do not clearly identify a non-production resource.

Configure that GitHub environment with:

- variables: `BUNNY_MEDIA_REGION`, `BUNNY_MEDIA_CDN_URL`,
  `BUNNY_STORAGE_CONTRACT_EDGE_TTL_SECONDS`, and
  `BUNNY_STORAGE_CONTRACT_BROWSER_TTL_SECONDS`;
- secrets: `BUNNY_MEDIA_ZONE`, `BUNNY_MEDIA_PASSWORD`, and
  `BUNNY_CDN_API_KEY`;
- required reviewers so a second confirmation is needed before the job can
  access credentials.

Configure `Block Request` Edge Rules on the Pull Zone for `/originals/*` and
`/transfer-chunks/*`; leave `/renditions/*` publicly deliverable. Run the
workflow from the release branch after ordinary CI passes. It creates random
contract objects, verifies both `ActionType: 4` rules through the Core API,
proves both protected paths return HTTP 403 from CDN, verifies
same-origin browser upload protection, checks Rendition cache headers, then
purges every object in a `finally` cleanup. Never point this environment at a
production zone. A successful run is the release evidence for the Bunny S3
preview, path protection, delivery, and permanent-deletion contract.

## Public delivery checks

After the storage contract passes, verify the exact deployed commit without
using private provider or database output as evidence:

1. Load `/photos`, `/en/photos`, and the homepage in both locales. They must use
   one active Published Photo Selection with no static fallback.
2. Confirm rendered media URLs use the configured Bunny CDN hostname, return
   `image/jpeg`, and select responsive 640, 1024, 1600, and 2560 Renditions. An
   expanded photo must use the largest available Rendition rather than enlarging
   its tile source.
3. Confirm HTML and public responses contain no Original or transfer-chunk key,
   checksum, exact Capture Location, encrypted location, raw metadata, Alt Text
   Suggestion, provider response, or private error.
4. Check natural aspect ratios, Focal Point crops, keyboard and touch metadata,
   reduced motion, and localized Alt Text.

A failed Publish must leave the previous Published Photo Selection active.
Interrupted ingestion must remain recoverable through reconciliation or the
owner Resume processing action. Production database or cloud verification still
requires two fresh explicit confirmations.
