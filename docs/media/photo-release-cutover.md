# Issue #96 photo release cutover

This cutover uses the owner Media Library and Photo Selection workflows. Do not
merge the final local-photo cleanup until every delivery check below passes in
the target environment.

## Fixed inputs

| Order | Original | SHA-256 |
| --- | --- | --- |
| 1 | `IMG_7560.HEIC` | `88a49da230bb852105ed25e9135cd076d2d515810767a57f79839c6933fe4f49` |
| 2 | `IMG_20250508_003134_Original.JPG` | `1825bebd811ee2ff341932b96967bd13a0102e1aec90a699af981eaec8991c51` |

The files currently live in `~/Downloads`. The admin persists an unfinished
upload's idempotency key by checksum until processing succeeds, so selecting
the same Original after a browser or request interruption resumes the same
Upload Intent instead of registering another asset.

## Import and review

1. Confirm the deployment uses the intended non-production or production Neon
   database and matching Bunny zones. Production database or cloud changes
   require two explicit confirmations.
2. Sign in to `/admin/media`, select both Originals together, and wait until
   both Media Assets are Ready for review. Do not upload the prepared JPEGs as
   Originals.
3. Confirm all 640, 1024, and 1600 Renditions are progressive sRGB JPEGs and
   that their embedded metadata is stripped. Confirm each Original remains
   readable only through the authenticated server boundary.
4. Review orientation, capture date, camera details, editable Location Labels,
   and Focal Points. Generate or edit both Alt Text languages, then explicitly
   approve the pair for each Media Asset.
5. In `/admin/media#publish`, add only these two assets in the table order
   above and verify the homepage preview. Publish once; a retry must use the
   same idempotency key and Published Photo Selection revision.

## Public delivery gate

1. Load `/photos` and the homepage in both locales. They must report two photos
   from one Published Photo Selection revision with no static fallback.
2. Verify each rendered URL uses the configured Bunny CDN hostname, returns
   `image/jpeg`, and selects a responsive Rendition. Confirm all three profile
   URLs deliver successfully before testing an expanded photo.
3. Confirm source HTML and public responses contain no Original key or URL,
   checksum, exact coordinates, encrypted Capture Location, raw metadata, AI
   suggestion, provider response, or private error.
4. Check natural aspect ratios, Focal Point crops, keyboard and touch metadata,
   reduced motion, and localized Alt Text.
5. Record the successful Bunny live contract run and these read checks in the
   release evidence. Only then merge the final cleanup that removes
   `lib/photos.ts` and `public/images/photos/photo-{1..6}`.

If any step fails, leave the prior deployment and local assets untouched. A
failed Publish keeps the previous Published Photo Selection active, and an
interrupted ingestion is recovered by the reconciliation job or the owner's
Resume processing action.
