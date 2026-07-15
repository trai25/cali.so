# Retire comments, reactions, and guestbook; archive then drop their data

v3 keeps the public blog, projects, photos, feeds, and published newsletter editions, but deliberately retires comments, reactions, and the guestbook. Newsletter editions become static read-only archives; newsletter signup, sending, and administration do not ship. AMA and admin groundwork remains disabled for the production launch. These absences are scope decisions, not oversights.

Legacy comments, reactions, and guestbook records are exported to a private JSON archive (kept out of this public repo, alongside the Sanity `_id → slug` map so the archive stays interpretable) before their production tables are retired.

## Consequences

- Retired public routes (`/guestbook`, `/sign-in`, `/sign-up`) get permanent redirects; their API routes are deleted.
- Reader history is preserved in the archive and could be resurrected in a future form, but v3 ships without it.
