# Store media binaries in Bunny and catalog metadata in Neon

## Status

Accepted; storage-zone topology superseded by ADR-0013

## Context

The site needs owner-managed photographs without storing large binaries in
Neon or making a deployment the publication mechanism. Originals may contain
precise Capture Location and other embedded metadata, while public delivery
needs immutable, optimized files. Bunny's S3-compatible API is still in public
preview and lacks object versioning, lifecycle transitions, batch deletion,
standard object cache headers, and reliable ETags.

## Decision

The Media Library stores private Originals and public Renditions in separate
existing Bunny Storage Zones. The Original zone has no public delivery surface.
The Rendition zone is delivered through Bunny CDN using immutable object keys.

Neon is the catalog and publication source of truth. It owns stable Media Asset
identities, private normalized metadata, encrypted Capture Location, Display
Metadata, Alt Text Suggestions, approved Alt Text, Focal Points, storage keys,
durable processing and Purge progress, Draft Photo Selection state, and
immutable Published Photo Selection snapshots. Bunny listings are not catalog
state, and public URLs are derived rather than persisted.

External storage and database writes cannot share a transaction. Registration,
repair, and Purge therefore persist idempotent operation progress before each
side effect and resume from the last confirmed step. A Media Asset becomes
ready only after its Original and complete required Rendition manifest are
verified. Purge deletes the catalog record last.

Public pages consume one allowlisted projection of the current Published Photo
Selection. That snapshot captures the public Rendition references, order,
Focal Points, Alt Text, and Display Metadata. Editing a Media Asset or Draft
Photo Selection cannot change public output until Publish atomically advances
the active snapshot.

Owner-authenticated admin pages manage the catalog and its public selections.
Git remains the source of truth for MDX and ordinary site content, so adopting
the Media Library does not turn Bunny or Neon into a general-purpose CMS.

## Consequences

- Archive is a reversible catalog state, not access revocation. It is blocked
  while a Media Asset belongs to a Draft or Published Photo Selection.
- Purge is explicit, irreversible, resumable, and must clear every known Bunny
  CDN URL before it reports success. Replication is not a backup from Purge.
- Raw embedded metadata is not stored in Neon or copied into Renditions. Public
  projections cannot contain Capture Location, Original references, provider
  payloads, or operation details.
- Rendition keys are versioned and never overwritten. Pull Zone cache policy is
  configured at the CDN because Bunny does not accept the needed object cache
  headers.
- Bunny S3 supports presigned URLs but cannot configure CORS on the private
  Storage endpoint; CORS requires a CDN Pull Zone, which Originals must not
  have. The browser therefore sends 4 MiB same-origin chunks through bounded
  owner-authorized Route Handler requests, with enforced chunk order and a
  dedicated per-Upload-Intent rate limit. Completion assembles and verifies the
  full Original in the private zone before processing. Reconciliation claims
  stale Upload Intents after a 15-minute activity lease before removing
  abandoned chunks so cleanup cannot race an active transfer.
- Git-owned writing and non-photo assets remain outside this context.
