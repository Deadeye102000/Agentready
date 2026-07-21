# Known Setup Issues

These are unresolved environment/setup issues observed during the initial AgentReady monorepo and Prisma setup. They are not product bugs yet, but they should be fixed or revisited when the relevant workflow is needed.

## Docker is not available

- Command tried: `docker compose up -d postgres`
- Result: `zsh:1: command not found: docker`
- Impact: PostgreSQL could not be started from `docker-compose.yml` in this environment.
- Revisit when: Running migrations, seed data, or local API/database integration.

## PostgreSQL is not running locally

- Command tried: `DATABASE_URL='postgresql://agentready:agentready@localhost:5432/agentready?schema=public' pnpm --filter @agentready/db exec prisma migrate dev --schema ../../prisma/schema.prisma --name init --create-only`
- Result: Prisma migration failed because the database was not reachable.
- Command tried: `DATABASE_URL='postgresql://agentready:agentready@localhost:5432/agentready?schema=public' pnpm db:seed`
- Result: `Can't reach database server at localhost:5432`
- Impact: Migration and seed acceptance criteria could not be fully executed.
- Revisit when: Docker/PostgreSQL is available.

## PostgreSQL health tooling is not available

- Command tried: `pg_isready -h localhost -p 5432 -U agentready -d agentready`
- Result: `zsh:1: command not found: pg_isready`
- Impact: Could not independently check PostgreSQL readiness outside Prisma.
- Revisit when: Improving local setup diagnostics.

## Prisma needs DATABASE_URL for validate/generate

- Initial result: Prisma validation failed when `DATABASE_URL` was not set.
- Workaround used: Passed `DATABASE_URL='postgresql://agentready:agentready@localhost:5432/agentready?schema=public'` inline for validation and generation.
- Impact: Developers need `.env` copied from `.env.example` or an inline `DATABASE_URL`.
- Revisit when: Adding onboarding scripts or a setup doctor command.

## Legacy Prisma client generator caused auto-install failure

- Previous generator: `provider = "prisma-client-js"`
- Result: Prisma attempted `pnpm add prisma@6.19.3 -D --silent` during generate and failed.
- Fix applied: Switched to `provider = "prisma-client"` with output at `packages/db/src/generated/prisma`.
- Current status: `pnpm db:validate` and `pnpm db:generate` pass when `DATABASE_URL` is provided.
- Revisit when: Upgrading Prisma or changing generated client output.
