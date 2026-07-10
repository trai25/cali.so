# Content lives as MDX files in the repo, not a CMS

v1 stored blog posts, projects, and site settings in Sanity. For v2 we move all content into the repo: posts as `.mdx` files under `content/blog/<slug>/` with their images colocated in the same directory, projects and settings as typed config files. Sanity is removed entirely once a full export (documents, `_id → slug` map, and all CDN images) has been taken and the migration verified — its CDN URLs die with the project, so the export must come first.

## Considered Options

- **Postgres + own admin editor** — phone-editable, but we'd own an editor UI forever.
- **Another CMS (Payload, Keystatic, …)** — keeps a UI editor but keeps the CMS dependency v2 exists to shed.
- **MDX in repo (chosen)** — git-as-CMS for a solo author: versioned with the site, written in the editor, zero content infra.

## Consequences

- Post slugs are frozen by the URL back-compat requirement (issue #75); the filename/slug is the post's permanent identity.
- Publishing requires a git push; there is no phone editing path.
