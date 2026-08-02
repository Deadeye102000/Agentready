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

## Prisma client must be regenerated after schema edits

- Trigger observed: Added auth support with `User.passwordHash`.
- Required command: `DATABASE_URL='postgresql://agentready:agentready@localhost:5432/agentready?schema=public' pnpm --filter @agentready/db db:generate`
- Impact: TypeScript may not see new model fields until the generated client under `packages/db/src/generated/prisma` is updated.
- Revisit when: Adding a prebuild check or making schema changes through migrations only.

## Legacy Prisma client generator caused auto-install failure

- Previous generator: `provider = "prisma-client-js"`
- Result: Prisma attempted `pnpm add prisma@6.19.3 -D --silent` during generate and failed.
- Fix applied: Switched to `provider = "prisma-client"` with output at `packages/db/src/generated/prisma`.
- Current status: `pnpm db:validate` and `pnpm db:generate` pass when `DATABASE_URL` is provided.
- Revisit when: Upgrading Prisma or changing generated client output.

## Database migration still needs a reachable database

- Current status: `prisma validate` and `prisma generate` pass with inline `DATABASE_URL`.
- Remaining gap: `pnpm db:migrate` and `pnpm db:seed` require PostgreSQL to be reachable.
- Impact: Auth and tenancy schema changes, including `User.passwordHash`, will not exist in a real local database until migration runs.
- Recommended order once PostgreSQL is available:
  1. `cp .env.example .env`
  2. Start PostgreSQL manually or through Docker.
  3. `pnpm db:migrate`
  4. `pnpm db:seed`
- Revisit when: Docker/PostgreSQL is installed or a hosted dev database is configured.

## Auth requires a stable session secret

- Required env var: `AUTH_SESSION_SECRET`
- Minimum length enforced by API env validation: 32 characters.
- Development default exists, but should not be used in production.
- Impact: Changing this secret invalidates all signed HTTP-only session cookies.
- Revisit when: Adding deployment docs or secret management.

## API security env vars are now validated

- New env vars:
  - `API_BODY_LIMIT_BYTES`
  - `API_RATE_LIMIT_MAX`
  - `API_RATE_LIMIT_WINDOW`
  - `API_AUTH_RATE_LIMIT_MAX`
  - `API_AUTH_RATE_LIMIT_WINDOW`
- Current defaults are local-development friendly:
  - Body limit: `1048576` bytes
  - Global rate limit: `300` requests per `1 minute`
  - Auth rate limit: `20` requests per `1 minute`
- Impact: Invalid values fail API startup during env validation.
- Revisit when: Adding deployment-specific limits.

## CORS cannot use wildcard origins with credentials

- Current behavior: `API_CORS_ORIGINS` is validated and cannot include `*`.
- Reason: The API enables credentialed requests for HTTP-only auth cookies.
- Local default: `API_CORS_ORIGINS="http://localhost:3000"`
- Impact: Add each frontend origin explicitly for local/staging/production.
- Revisit when: Adding deployment docs or environment templates.

## Protected API routes now require auth cookies

- Current behavior: B2B routes under `/api/v1` are protected after auth routes are registered.
- Public routes:
  - `POST /api/v1/auth/register`
  - `POST /api/v1/auth/login`
  - `POST /api/v1/auth/logout`
  - `GET /api/v1/auth/me`
  - `POST /api/v1/_test/validation`
- Impact: Direct calls to dashboard, executions, contracts, evals, governance, and observability endpoints return `401` unless the request includes a valid `agentready_session` cookie.
- Revisit when: Adding frontend login UI and API client helpers.

## Audit log endpoint is protected and org-scoped

- Current endpoint: `GET /api/v1/audit-logs`
- Requires: valid `agentready_session` cookie.
- Optional query: `limit`, capped at 100.
- Impact: Manual API testing requires login first. Without a session, the endpoint returns a standardized `401 UNAUTHORIZED` response.
- Revisit when: Adding frontend audit log UI and route/API docs.

## Sensitive action audit logs can make writes fail

- Current behavior: Audit writes for sensitive actions are awaited.
- Reason: For critical actions, it is safer to fail than to perform the action without a reliable audit record.
- Impact: If the database is unavailable or audit insert fails, actions such as login/register, task contract creation, execution creation, approval review, feature flag toggles, and gate updates may fail.
- Revisit when: Deciding whether to introduce transactional audit writes or an outbox pattern.

## Organization ID is now server-derived

- Current behavior: Protected route schemas omit `organizationId`; routes derive it from `request.authContext`.
- Impact: Older manual API calls that include `organizationId` in query/body may fail validation or be ignored depending on the route.
- Correct pattern: Log in first, keep the HTTP-only cookie, then call protected APIs without sending `organizationId`.
- Revisit when: Updating API docs, curl examples, and frontend data fetching.

## Error responses are standardized

- Current shape:
  ```json
  {
    "error": {
      "code": "...",
      "message": "...",
      "details": {
        "requestId": "..."
      }
    }
  }
  ```
- Normalized cases include:
  - Zod validation errors
  - `HttpError`
  - Prisma known errors such as `P2002`, `P2025`, and `P2003`
  - body-limit errors
  - rate-limit errors
  - CORS denials
  - internal errors
- Impact: Any frontend/API client should read errors from `error.code`, `error.message`, and `error.details`.
- Revisit when: Generating typed API clients or adding frontend error states.

## Frontend dashboard still has demo fallback behavior

- Current behavior: `apps/web/src/app/page.tsx` fetches `/api/v1/observability/dashboard` and falls back to hardcoded demo-shaped data if the API call fails.
- Impact: If unauthenticated, the protected API returns `401`, and the page can still show fallback demo data. This is helpful during local UI work but can hide auth/API setup problems.
- Revisit when: Adding login UI, authenticated dashboard loading states, and explicit unauthenticated screens.

## API port expectations need to stay aligned

- `.env.example` sets `API_PORT=3001`.
- The frontend uses `AGENTREADY_API_URL` or defaults to `http://localhost:4000`.
- Impact: Without setting `AGENTREADY_API_URL=http://localhost:3001`, the dashboard may call the wrong API port and show fallback data.
- Recommended local web env: `AGENTREADY_API_URL=http://localhost:3001`.
- Revisit when: Adding web `.env.example`, shared config, or Next.js rewrites.

## Initial git baseline is still important

- Observed state: Earlier work happened while the repo was fully untracked.
- Impact: `git diff` is not useful until there is an initial commit. Reviews and incremental audits become harder.
- Recommended action:
  - Commit the current foundation once the user is ready.
  - After that, use `git diff`, `git show`, and small scoped commits for each feature.
- Revisit when: Preparing the first clean commit or PR.

## Mock DB Client direct assignments require casting proxy reference

- Context: Prisma client's auto-generated types define query methods (like `findUnique`, `findFirst`, `create`) as read-only properties.
- Result: Directly reassigning them like `prisma.user.findUnique = ...` inside the mock store module (`apps/api/test/mockPrisma.ts`) causes TypeScript diagnostics and IDE/terminal problems.
- Fix: All assignments are routed through a cast proxy reference: `const mockPrisma = prisma as any;`.
- Revisit when: Writing new model test mocks.

## Compound Unique Constraints with Nullable Fields in Prisma

- Context: A unique constraint on multiple fields, where one field is optional/nullable (e.g., `@@unique([organizationId, agentId, capability])` with `agentId` being optional).
- Result: Prisma's generated compound query types enforce that compound fields cannot be `null`, making standard unique `upsert` calls on nullable fields fail typechecking.
- Fix: Perform an existence check first using `findFirst` (which accepts `null` in its `where` clause) followed by a separate `create` or `update` call.
- Revisit when: Designing database indexes for governance resources.

## Mock DB Client does not automatically implement sorting or relation loading

- Context: The integration tests run against `mockPrisma.ts` using an in-memory MockStore.
- Result: Arguments like `orderBy: { createdAt: "desc" }` or nested `include` blocks are ignored by the simple array-based find operations unless explicitly implemented in the override mock handlers.
- Fix: Ensure service layers perform manual sort operations on grouped results (e.g. `caseRuns.sort((a, b) => new Date(b.createdAt).getTime() - ...)`), and update mock handlers in `mockPrisma.ts` to manually resolve relations.
- Revisit when: Modifying or creating new mock client handlers for integration tests.

