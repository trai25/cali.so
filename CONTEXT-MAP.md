# Context Map

Personal site v3 is a ground-up rewrite; contexts are added here as the
architecture takes shape. Each context gets its own `CONTEXT.md` (glossary)
and `docs/adr/` (context-scoped decisions). System-wide ADRs live in `docs/adr/`.

## Contexts

- [AMA Booking](./lib/ama/CONTEXT.md) — sells and manages Cali's paid
  one-to-one AMA sessions
- [Media Library](./lib/media/CONTEXT.md): stores, reviews, and curates photos
  through the owner admin, then publishes an immutable Photo Selection to the
  homepage and public photos page
