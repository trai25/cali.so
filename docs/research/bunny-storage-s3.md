# Bunny Storage S3 compatibility research

_First-party documentation reviewed 2026-07-14. S3 compatibility is in public
preview and has to be selected when creating the Storage Zone; it cannot be
enabled or disabled later._ [Bunny S3 documentation](https://docs.bunny.net/storage/s3)

## Connection model

| Concern | Bunny S3-compatible API |
| --- | --- |
| Bucket | The bucket is the Storage Zone: its name is the Access Key ID and appears in the request path. |
| Endpoint | `https://{region}-s3.storage.bunnycdn.com`; the selected primary region determines `{region}`. |
| Region codes available to S3 | `de`, `ny`, `sg`, `uk`, `se`, `la`, `jh`, and `syd`. São Paulo is not listed as S3-compatible. |
| Addressing | Path-style only: `https://{region}-s3.storage.bunnycdn.com/{bucket}/{key}`. Virtual-hosted buckets are unsupported. |
| Credentials | Access Key ID = Storage Zone name; Secret Access Key = Storage Zone password, both available on the zone's **Access** tab. |

These are Bunny's S3 connection settings, including the regional list and
path-style restriction. [Bunny S3 documentation](https://docs.bunny.net/storage/s3)

Use an S3 client that can set a custom endpoint and path-style addressing. Its
requests must use the configured region and zone credentials. Bunny documents
AWS Signature Version 4 (`AWS4-HMAC-SHA256`) for presigned URLs; its
documentation does not separately spell out the canonical-request details for
ordinary signed S3 requests. [Bunny S3 documentation](https://docs.bunny.net/storage/s3)

## Supported surface and limits

The API supports `PutObject`, `GetObject` (including byte ranges),
`HeadObject`, `DeleteObject`, same-zone `CopyObject`, object listing V1/V2,
and presigning. Listings support prefixes, pagination, and common prefixes.
Multipart uploads support create, upload part, copy part, list parts, complete,
abort, and list uploads. Bunny recommends multipart for objects over 100 MB.
[Bunny S3 documentation](https://docs.bunny.net/storage/s3)

The documented S3 limits are 500 combined upload/download RPS and 1 Gbps
throughput. Multipart uploads allow at most 10,000 parts and sessions expire
after 10 days. The docs do not state a maximum single-object size or a
maximum multipart-object size. [Bunny S3 documentation](https://docs.bunny.net/storage/s3)

Notable compatibility gaps:

- `DeleteObjects` batch deletion, ACLs, object tagging, object locking/legal
  hold/retention, S3 Select, Glacier restore, server-side encryption, and
  versioning are unsupported. Lifecycle transitions are also unsupported.
  Deletes are therefore permanent from the S3 API's point of view. [Bunny S3 documentation](https://docs.bunny.net/storage/s3)
- Copying is within one Storage Zone only, up to 5 GB; it does not preserve
  `Content-Type` and does not offer metadata directives. `HeadObject` returns
  `Content-Type`, `Content-Length`, and `Last-Modified`, but not ETag.
  Conditional GET/HEAD requests are unsupported. [Bunny S3 documentation](https://docs.bunny.net/storage/s3)
- The S3 compatibility matrix does not document bucket creation, deletion,
  policy, or lifecycle API operations. Storage Zones are instead created and
  configured through Bunny's dashboard/Core API. Treat those bucket-level S3
  operations as unsupported unless verified in a target account. [Bunny S3 documentation](https://docs.bunny.net/storage/s3)

## Object headers, integrity, and caching

On upload, Bunny chooses `Content-Type` in this order: supplied
`Content-Type`, file-extension detection, then `binary/octet-stream`. It
accepts `x-amz-checksum-sha256` as a Base64 checksum. `PutObject` supports
only the documented system metadata (`Content-Type` and `Content-Length`);
`Cache-Control`, `Content-Disposition`, `Content-Encoding`, `Expires`,
`Content-Language`, tagging, ACL, and encryption headers are unsupported.
[Bunny S3 documentation](https://docs.bunny.net/storage/s3)

For CDN delivery, configure cache behavior on the Pull Zone, not object
metadata: an Edge Rule can override edge and browser cache times. A cached URL
will otherwise remain cached until its cache lifetime expires, eviction, or a
purge. [Custom cache-time Edge Rules](https://docs.bunny.net/cdn/edge-rules/custom-cache-time) · [CDN cache purging](https://docs.bunny.net/cdn/purge-cache)

## Presigned URLs and CORS

Presigning is supported with `AWS4-HMAC-SHA256`; expiration defaults to one
hour and may be 1 second through 7 days. Bunny says presigned URLs require
authentication. For publicly available presigned URLs fronted by CDN, attach a
Pull Zone to the Storage Zone. Bunny's presigned-URL cache only caches objects
up to 256 MB after they have been requested at least twice, while validating
signatures for cached objects. [Bunny S3 documentation](https://docs.bunny.net/storage/s3)

S3-level CORS configuration is unavailable: Bunny explicitly says CORS must be
handled at the CDN level. The Pull Zone update API exposes
`EnableAccessControlOriginHeader` and
`AccessControlOriginHeaderExtensions`; Edge Rules can also set response
headers. Bunny's reviewed documentation does not specify the resulting
`Access-Control-*` header values, allowed-origin policy, preflight behavior,
or a declarative S3 CORS document format, so validate those in a non-production
zone before allowing browser uploads. [Bunny S3 documentation](https://docs.bunny.net/storage/s3) · [Pull Zone update API](https://docs.bunny.net/api-reference/core/pull-zone/update-pull-zone) · [Edge Rules](https://docs.bunny.net/cdn/edge-rules/index)

## Delivery, replication, and cost model

Create a Pull Zone whose origin type is the Bunny Storage Zone. Files are then
available at `https://{pull-zone}.b-cdn.net/{key}` (or a configured custom
hostname) and delivered through Bunny CDN. [Storage quickstart](https://docs.bunny.net/storage/quickstart) · [Pull Zone quickstart](https://docs.bunny.net/cdn/quickstart)

Uploads go to the primary region, then replicate to selected regions. During a
primary-region outage uploads are unavailable, though delivery can continue
from replication regions. With S3 compatibility, both Standard and Edge tiers
are limited to four replication regions, unlike HTTP/FTP's 9 and 15
respectively. Additional replication regions cannot be removed after zone
creation. [Replication](https://docs.bunny.net/storage/replication) · [Storage tiers](https://docs.bunny.net/storage/storage-tiers)

One extra region is Bunny's minimum recommendation for its advertised eleven
nines durability; data uses RAID 6 in each datacenter. Storage pricing scales
with tier and replica count: Standard is $0.01/GB for one region, $0.02/GB for
two, then +$0.005/GB per additional region; Edge is $0.02/GB per region. Both
have a $1 monthly minimum. Storage-to-Bunny-CDN traffic and API egress are
listed as free, while end-user CDN delivery is billed separately. Confirm live
rates before committing, since the pricing page is the source of record.
[Durability](https://docs.bunny.net/storage/durability) · [Storage pricing](https://docs.bunny.net/storage/pricing)

## Recommended Next.js integration

1. Create the S3-compatible Storage Zone with its tier, primary region, and
   replication plan. Enable a Pull Zone for public delivery. S3 compatibility
   cannot be changed later and replication regions cannot be removed later.
   [Bunny S3 documentation](https://docs.bunny.net/storage/s3) · [Replication](https://docs.bunny.net/storage/replication)
2. Keep the Storage Zone password in server-only environment configuration.
   Build the S3 client in Next.js server code with Bunny's endpoint, the
   matching region, zone name, and path-style addressing. Do not put the zone
   password in a client bundle; Bunny identifies it as the Secret Access Key
   and says to keep storage credentials secure. [Bunny S3 documentation](https://docs.bunny.net/storage/s3) · [Storage quickstart](https://docs.bunny.net/storage/quickstart)
3. Have Route Handlers or Server Actions perform trusted uploads, deletes, and
   listings. For direct browser transfers, have a server endpoint mint a
   short-lived S3 presigned URL only after application authorization, and test
   the CDN-level CORS configuration and expiry behavior. [Bunny S3 documentation](https://docs.bunny.net/storage/s3)
4. Return the Pull Zone/custom-domain URL to browsers for reads, never the
   storage endpoint. Use immutable or versioned object keys when content
   changes, then purge the Pull Zone where an immediate update is required.
   [Storage quickstart](https://docs.bunny.net/storage/quickstart) · [CDN cache purging](https://docs.bunny.net/cdn/purge-cache)

There is no Bunny-authored Next.js S3 integration example in the reviewed
[Storage S3](https://docs.bunny.net/storage/s3),
[Storage TypeScript SDK](https://docs.bunny.net/storage/typescript-sdk), or CDN
documentation. The above is a server-side design recommendation derived from
Bunny's credential, endpoint, presign, CORS, and CDN constraints, rather than
an official Next.js recipe.
