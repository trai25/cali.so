# Media Alt Text Suggestion provider policy

Status: approved for deployed use on 2026-07-17. The capability is enabled by
default and has no runtime feature switch.

This policy covers only Alt Text Suggestion generation for the Media Library.
It does not authorize other image analysis, captions, tagging, search, or
generative editing.

## Selected routing

- Primary model: `openai/gpt-5.6-luna`
- Model fallback: `openai/gpt-5.4-mini`
- Model availability and vision support were checked against the public AI
  Gateway model catalog on 2026-07-17.
- Both model identifiers are server configuration and can be replaced without
  changing the application service.
- This routing preserves model-level fallback but not provider-level outage
  isolation; that tradeoff is accepted for the owner-only Staging feature.

## Data boundary

Each request contains only the authenticated owner's Gateway attribution, the
feature tag `feature:media-alt-text`, fixed generation instructions, and the
verified 640-pixel sanitized JPEG Rendition. Requests must not contain an
Original, private filename, Original object key, raw metadata, Capture
Location, Location Label, or camera metadata.

The application requests AI Gateway Zero Data Retention and disallows routing
to providers that train on prompts. Gateway content logging must remain off.
The owner review covers retention, training, subprocessors, regional
processing, and incident handling. Deployments must continue to satisfy the
data and credential boundaries below.

## Credentials and controls

Vercel deployments use OIDC. Non-Vercel production runtimes also reject a
static `AI_GATEWAY_API_KEY`; static keys are allowed only for local or CI
configuration through the platform secret store. No
provider credential or Gateway credential may enter a client bundle, log,
database row, or repository file.

Generation is non-streaming and structured. Each language is limited to 280
characters. Calls have a 12-second timeout, one SDK retry, model fallback, an
owner-scoped limit of 10 requests per hour, and Gateway cost
attribution. Provider failure never clears an existing Alt Text Suggestion or
owner-approved Alt Text, and manual Alt Text remains available without AI.

## Provider approval

The owner approved deployed use on 2026-07-17 with these restrictions: Vercel
AI Gateway OIDC only, no static Gateway or provider credentials, Gateway
content logging off, Zero Data Retention and prompt-training prohibition
requested on every generation, and the existing owner limit of 10 requests per
hour.
