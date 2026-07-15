# Bunny Media Storage live release gate

The destructive storage contract is isolated in the GitHub Actions workflow
`Media Storage Live Contract`. It is manual, targets the protected
`bunny-media-contract` environment, and requires the exact
`confirmed-non-production` input. The tests also reject zone and hostname names
that do not clearly identify a non-production resource.

Configure that GitHub environment with:

- variables: `BUNNY_MEDIA_REGION`, `BUNNY_RENDITIONS_CDN_URL`,
  `BUNNY_STORAGE_CONTRACT_EDGE_TTL_SECONDS`, and
  `BUNNY_STORAGE_CONTRACT_BROWSER_TTL_SECONDS`;
- secrets: `BUNNY_ORIGINALS_ZONE`, `BUNNY_ORIGINALS_PASSWORD`,
  `BUNNY_RENDITIONS_ZONE`, `BUNNY_RENDITIONS_PASSWORD`, and
  `BUNNY_CDN_API_KEY`;
- required reviewers so a second confirmation is needed before the job can
  access credentials.

Run the workflow from the release branch after ordinary CI passes. It creates
random contract objects, proves the Original zone rejects unsigned reads and
listing, verifies same-origin browser upload protection, checks Rendition cache
headers, then purges every object in a `finally` cleanup. Never point this
environment at production zones. A successful run is the release evidence for
the Bunny S3 preview, delivery, privacy, and permanent-deletion contract.
