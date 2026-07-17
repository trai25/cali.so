# Let GitHub Actions control Neon-backed deployments

## Status

Accepted. This supersedes the integration-branch naming portion of ADR-0005.

Git `dev` is the long-lived Staging branch, backed by a persistent `staging`
branch in the non-production Neon project. Internal feature branches receive
persistent `preview/<git-branch>` children of Staging; Git `main` deploys to a
separate Production Neon project. GitHub Actions creates or reuses the database
branch, runs migrations, then deploys the exact commit, while Vercel Git
deployments stay disabled so code cannot race its schema. Migration credentials
exist only in scoped GitHub deployment steps, Vercel receives CRUD-only runtime
URLs, and Production requires protected-environment approval plus an expand-only
migration check. This custom control plane is more involved than Neon's managed
Vercel integration, but it preserves a non-production Staging parent and keeps
DDL credentials out of application builds and runtimes.
