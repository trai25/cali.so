# Authorize owner admin through Clerk metadata

## Status

Accepted. This supersedes ADR-0004 and the immutable-user-ID allowlist direction
previously recorded in issue #93.

Clerk is the sole runtime authentication system for owner admin. Signed-out
requests for `/admin` redirect directly to Clerk sign-in. After sign-in, every
admin page and API loads the authoritative Clerk user on the server and allows
access only when `publicMetadata.siteOwner` is exactly the string `"yes"`.
The immutable Clerk user ID identifies the authenticated actor for rate limits
and audit events. Existing Media and AMA records retain their established owner
namespace so this authentication migration does not orphan previously created
data. That namespace never grants access; only the authoritative Clerk metadata
check does.

Signed-in users without the marker receive a deliberate HTTP 403 page without
loading admin data and get HTTP 403 from admin APIs. Signed-out API requests
receive HTTP 401. The retired magic-link
request and verification endpoints remain absent. Same-origin mutation checks,
rate limits, privacy-safe audit events, strict admin CSP, and independent
provider capability switches remain in force.
