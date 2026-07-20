# Historical issue #96 photo release cutover

Status: completed in July 2026. This file preserves the two-photo migration
inputs and the release boundary that removed the static fallback. It is not a
current operating procedure. Current uploads use `/admin/media`, curation and
publication use `/admin/photos`, and the active contract lives in
`lib/media/CONTEXT.md`. Current storage and public-delivery release checks live
in `docs/media/bunny-live-release-gate.md`.

## Fixed inputs

| Order | Original | SHA-256 |
| --- | --- | --- |
| 1 | `IMG_7560.HEIC` | `88a49da230bb852105ed25e9135cd076d2d515810767a57f79839c6933fe4f49` |
| 2 | `IMG_20250508_003134_Original.JPG` | `1825bebd811ee2ff341932b96967bd13a0102e1aec90a699af981eaec8991c51` |

These were the fixed Originals used for the cutover. Their former local
`~/Downloads` location was temporary and is not part of the repository or the
current recovery contract.

## Completed outcome

- Issue #96 is closed and its Media Library, ingestion, curation, and public
  Photo Selection paths shipped.
- `lib/photos.ts` and `public/images/photos/photo-{1..6}` were removed. Public
  pages have no static photo fallback.
- `/admin/media` owns upload-to-archive and asset editing. A first Alt Text
  Suggestion auto-applies when approved Alt Text is absent; regeneration never
  overwrites approved text.
- `/admin/photos` owns Draft Photo Selection curation and publication.
- New processing produces 640, 1024, 1600, and 2560 progressive sRGB JPEG
  Renditions. Only Renditions are publicly deliverable.

## Historical boundary

The cutover established that Originals, transfer chunks, checksums, exact
Capture Locations, Alt Text Suggestions, provider payloads, and private errors
do not enter public responses. It also established that a failed Publish keeps
the previous Published Photo Selection active and interrupted ingestion remains
recoverable. The current release gate preserves those guarantees.
