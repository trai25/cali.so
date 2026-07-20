# Media Library

## Status

Implemented end to end for Bunny storage, catalog persistence, image
processing, privacy boundaries, resumable ingestion, owner review, and photo
curation. The owner admin manages Media Assets and Draft Photo Selections;
`/photos` and the homepage consume the active Published Photo Selection. The
retired static photo fallback is not part of v3. Originals and Renditions share
one Media Store, while only Renditions are available through public delivery.

The Media Library owns reusable files, their safe descriptive metadata, and
the selections that publish them across the personal site.

## Language

**Media Asset**:
A reusable file registered in the Media Library, together with its owned
metadata and storage references. Only a ready Media Asset appears in Library
or Archived; an incomplete attempt remains a Transfer Job.
_Avoid_: Upload, file record

**Transfer Job**:
The owner-visible attempt to move one chosen Original through transfer,
verification, and processing into Archive. A failed Transfer Job remains in the
transfer queue for Retry or permanent Discard. An in-flight processing job can
also be permanently Discarded; processing and Purge serialize on that Media
Asset so no late Rendition can escape cleanup. Transfer Jobs do not appear as
empty Archived Media Assets.
_Avoid_: Empty Media Asset, failed archive item

**Original**:
The protected, full-quality source object from which public versions are made.
It is never delivered to visitors.
_Avoid_: Source file, master

**Upload Intent**:
A short-lived, owner-authorized reservation for registering one Original under
one opaque object key. It records transfer expectations before bytes move and
can expire without creating a ready Media Asset.
_Avoid_: Pending file, temporary upload

**Rendition**:
A public, delivery-ready version derived from an Original.
_Avoid_: Copy, thumbnail

New image processing produces no-upscale 640, 1024, 1600, and 2560 profiles as
progressive sRGB JPEGs at quality 90 with 4:4:4 chroma. Embedded metadata is
stripped from every Rendition while the protected Original remains byte-for-byte
unchanged. The original three-profile publication baseline remains readable;
newly processed Media Assets add the 2560 profile for high-density lightboxes.

**Display Metadata**:
The allowlisted location, capture, and camera details that may be shown to a
visitor. Raw embedded metadata is not Display Metadata.
_Avoid_: EXIF blob, raw metadata

**Capture Location**:
The private coordinates extracted from an Original. Capture Location is never
published directly.
_Avoid_: Public location, photo address

**Location Label**:
The owner-editable place name that may be included in Display Metadata.
_Avoid_: GPS, coordinates

**Focal Point**:
The owner-selected point of interest used when a Rendition must be cropped for
a presentation surface. It does not alter the Original.
_Avoid_: Crop, hotspot

**Alt Text Suggestion**:
An AI-generated bilingual candidate description. Since July 2026 a fresh
suggestion auto-applies as the approved Alt Text when none exists yet, so an
upload becomes publishable without a review step; the owner may edit or
regenerate at any time, and regeneration never overwrites approved text.
_Avoid_: Generated alt text, automatic alt text

**Alt Text**:
The approved Chinese and English visual descriptions required before a
Media Asset may join a Published Photo Selection. Approval is automatic on
first suggestion and explicit on any owner edit.
_Avoid_: Caption, Alt Text Suggestion

**Catalog State**:
Whether a Media Asset is active, Archived, or being purged. It records the
asset's standing in the catalog and is separate from Processing State, which
tracks derivation progress.
_Avoid_: Lifecycle, status

**Processing State**:
The durable progress of registering and deriving a Media Asset, including
Original verification, Rendition processing, readiness, retryable failure, and
repair required. It is separate from Catalog State.
_Avoid_: Lifecycle, upload status

Every processing write records its deterministic Rendition manifest before
the Bunny side effect. Processing, Discard, and Purge use the same per-asset
lock; Photo Selection mutations use one owner-scoped lock before Media Asset
locks. These orders are part of the persistence contract, not UI behavior.

**Archived Media Asset**:
A Media Asset hidden from normal library views and unavailable to new Photo
Selections while its files and metadata remain recoverable. Archive withdraws
the Media Asset from Draft and Published Photo Selections; immediate Undo may
restore the exact prior membership and order while those selection revisions
remain unchanged. A later Restore returns the Media Asset to the Library only.
_Avoid_: Deleted asset, trashed file

**Purge**:
The irreversible removal of a Media Asset, including its Original, Renditions,
and catalog record. If the Media Asset belongs to a Draft or Published Photo
Selection, Purge first withdraws that asset from both. Withdrawing from the
Published Photo Selection advances only that publication; unrelated Draft
changes remain unpublished.
_Avoid_: Delete, remove

**Photo Selection**:
An ordered set of Media Assets chosen for the public photos page. Membership
and order do not change the underlying Media Assets.
_Avoid_: Gallery, photo uploads

**Draft Photo Selection**:
The owner's editable Photo Selection. Its membership and order are not visible
to visitors until publication.
_Avoid_: Working gallery, unpublished photos

**Published Photo Selection**:
The immutable snapshot shown on the photos page and in homepage previews. It
captures membership, order, public Rendition references, Focal Points, Alt
Text, and Display Metadata, and changes only when the owner publishes a Draft
Photo Selection, or when Archive or Purge withdraws one Media Asset without
publishing unrelated Draft changes.
_Avoid_: Live gallery, active photos
