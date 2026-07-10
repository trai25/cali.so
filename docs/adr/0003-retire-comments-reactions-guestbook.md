# Retire comments, reactions, and guestbook; archive then drop their data

v2 keeps blog, projects, about, feeds, newsletters, and AMA, but deliberately retires comments, reactions, and the guestbook — their absence is a scope decision, not an oversight. Their Postgres tables are exported to a private JSON archive (kept out of this public repo, alongside the Sanity `_id → slug` map so the archive stays interpretable) and then dropped in a v2 migration.

## Consequences

- Retired public routes (`/guestbook`, `/sign-in`, `/sign-up`) get permanent redirects; their API routes are deleted.
- Reader history is preserved in the archive and could be resurrected in a future form, but v2 ships without it.
