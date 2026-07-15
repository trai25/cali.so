# Media Alt Text Suggestion provider policy

Status: pending owner approval for production use.

This policy covers only Alt Text Suggestion generation for the Media Library.
It does not authorize other image analysis, captions, tagging, search, or
generative editing.

## Selected routing

- Primary model: `google/gemini-3.1-flash-lite`
- Cross-provider fallback: `anthropic/claude-haiku-4.5`
- Model availability and vision support were checked against the public AI
  Gateway model catalog on 2026-07-15.
- Both model identifiers are server configuration and can be replaced without
  changing the application service.

## Data boundary

Each request contains only the authenticated owner's Gateway attribution, the
feature tag `feature:media-alt-text`, fixed generation instructions, and the
verified 640-pixel sanitized JPEG Rendition. Requests must not contain an
Original, private filename, Original object key, raw metadata, Capture
Location, Location Label, or camera metadata.

The application requests AI Gateway Zero Data Retention and disallows routing
to providers that train on prompts. Gateway content logging must remain off.
The provider and Gateway terms still need an owner review covering retention,
training, subprocessors, regional processing, and incident handling before the
production feature flag is approved.

## Credentials and controls

Deployed environments use Vercel OIDC. A static `AI_GATEWAY_API_KEY` is allowed
only for local or CI configuration through the platform secret store. No
provider credential or Gateway credential may enter a client bundle, log,
database row, or repository file.

Generation is non-streaming and structured. Each language is limited to 280
characters. Calls have a 12-second timeout, one SDK retry, cross-provider
fallback, an owner-scoped limit of 10 requests per hour, and Gateway cost
attribution. Provider failure never clears an existing Alt Text Suggestion or
owner-approved Alt Text, and manual Alt Text remains available without AI.

## Provider approval

AI generation in every environment stays disabled until this policy is
reviewed and `MEDIA_ALT_TEXT_PROVIDER_POLICY_APPROVED=true` is set together
with `MEDIA_ALT_TEXT_ENABLED=true`. Approval should record the review date and
any required regional or contractual restrictions in this document.
