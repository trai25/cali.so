# Keep owner admin available independently of AMA capabilities

## Status

Accepted. This supersedes the admin launch-disable portions of ADR-0003 and
ADR-0004. ADR-0011 supersedes this ADR's independent capability-switch
requirement.

The owner must be able to curate photos and manage AMA operations in every
deployed environment, so `/admin` and its authentication endpoints have no
environment kill switch. Security comes from server-side owner authentication
through Clerk and the exact `publicMetadata.siteOwner = "yes"` marker at each
data boundary, same-origin mutation checks, rate limits, audit events, and a
strict admin CSP. Public AMA mutations, payments, booking finalization, Google,
and Tencent remain independently fail-closed until approved.
