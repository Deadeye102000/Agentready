# Known Setup Issues & Operational Resolution Log

This document tracks environment, configuration, and setup issues observed in the AgentReady monorepo. It details resolved issues, their root causes, applied fixes, and ongoing architectural constraints for developers.

---

## Resolution Status Summary

| Issue | Category | Status | Resolution / Current Mitigation |
| :--- | :--- | :--- | :--- |
| **Docker is not available** | Environment | **RESOLVED** | Dual-track database strategy: local Docker (Option A) or hosted/cloud PostgreSQL (Option B, e.g. Supabase/Neon). 128 tests run 100% in-memory with zero Docker dependency. |
| **PostgreSQL is not running locally** | Environment | **RESOLVED** | Configured cloud Supabase connection via `DATABASE_URL` and `DIRECT_URL`. Schema synced via `pnpm db:push` and seeded via `pnpm db:seed`. |
| **PostgreSQL health tooling (`pg_isready`) missing** | Diagnostics | **RESOLVED** | Created native Prisma-based health check `scripts/check-db.ts` runnable via `pnpm db:health`. Eliminates dependence on native PostgreSQL binaries. |
| **Missing Environment Variables in `.env.example`** | Configuration | **RESOLVED** | Added `NEXT_PUBLIC_AGENTREADY_API_URL`, `AGENTREADY_AUTH_TOKEN`, `AGENTREADY_API_URL`, and `SANDBOX_AGENT_API_KEY` with documentation and safe defaults. |
| **Silent Mock Fallbacks in Web & Sandbox** | Frontend/API | **RESOLVED** | Removed silent mock fallbacks in `apps/web/src/app/page.tsx` and `/api/sandbox`. Web UI now displays explicit user-facing error banners and loading states. |
| **Missing `GET /api/v1/tool-call-traces` Endpoint** | Backend API | **RESOLVED** | Implemented paginated, tenant-isolated trace listing endpoint with `executionId` filtering in `agentExecutionRoutes.ts`. |
| **Unsafe Body & Param Type Casting** | API Security | **RESOLVED** | Replaced unsafe `as { id: string }` cast in `evalRunRoutes.ts` with Zod schema parsing; added strict Zod validation (`sandboxBodySchema`) to `/api/sandbox`. |
| **High Severity Dependency Vulnerabilities** | Dependencies | **RESOLVED** | Upgraded Fastify to `^5.12.3` and pinned patched versions (`fast-uri >= 3.1.6`, `@opentelemetry/core >= 2.8.0`, etc.) in `pnpm.overrides`. |
| **MCP Server Cookie Prefix Auth Hack** | Protocols/Auth | **RESOLVED** | Standardized MCP server on `Authorization: Bearer <api_key>` machine authentication with SHA-256 database verification. |
| **Prisma Needs DATABASE_URL for Validate/Generate** | Tooling | **RESOLVED** | `.env.example` supplies development fallback; `postinstall` runs `pnpm db:generate`. |
| **Prisma Generator Auto-Install Failure** | Tooling | **RESOLVED** | Switched generator provider from `prisma-client-js` to `prisma-client` pointing to `packages/db/src/generated/prisma`. |
| **Interactive Reset Prompt on Cloud DB (`migrate dev`)** | Database | **RESOLVED** | Documented `pnpm db:push` workflow for non-interactive schema synchronization against managed cloud databases. |

---

## Solved Issues & Applied Fixes

### 1. PostgreSQL Health Tooling Missing (`pg_isready` not found)

- **Previous Failure**: Running `pg_isready -h localhost -p 5432` failed on systems without native PostgreSQL client binaries (`command not found: pg_isready`).
- **Solution Applied**: Implemented a standalone TypeScript health check script (`packages/db/scripts/check-db.ts`) executed via `tsx`.
- **Command**:
  ```bash
  pnpm db:health
  ```
- **How It Works**:
  - Automatically locates `.env` across parent directories if not already loaded into environment.
  - Safely masks connection credentials in console output (`postgresql://user:*****@host:port/db`).
  - Executes a `SELECT 1` query via `@agentready/db` (PrismaClient) and logs roundtrip latency (e.g. `✅ Database is connected and healthy! (Roundtrip latency: 581ms)`).
  - Returns exit code `0` on success and `1` on connection error, making it suitable for CI/CD diagnostics and developer onboarding.

---

### 2. Docker Absence & Dual-Track Database Setup

- **Previous Failure**: On machines without Docker Desktop, developers could not run `docker compose up -d postgres` and assumed setup was blocked.
- **Solution Applied**:
  - Established **Option B (Cloud / Hosted Postgres)** in `README.md`. Developers can provide connection strings from Supabase, Neon, or RDS in `.env` (`DATABASE_URL` with connection pooling and `DIRECT_URL` for migrations/schema push).
  - Schema is applied non-destructively using `pnpm db:push` and populated via `pnpm db:seed`.
  - All 128 automated integration tests use an in-memory `mockPrisma` client, executing with 0 Docker or live database dependencies.

---

### 3. Missing Environment Variables in `.env.example`

- **Previous Failure**: Four variables were referenced in frontend and integration code but missing from `.env.example`:
  - `NEXT_PUBLIC_AGENTREADY_API_URL` (consumed by Next.js browser client in `apps/web/src/lib/api.ts`).
  - `AGENTREADY_API_URL` (consumed by Node/server environments and MCP server).
  - `AGENTREADY_AUTH_TOKEN` (consumed by client SDK integration testing).
  - `SANDBOX_AGENT_API_KEY` (consumed by `/api/sandbox` proxy for machine agent requests).
- **Solution Applied**: Added all four variables to `.env.example`, `.env`, and `prisma/.env` with explicit descriptions, port alignments, and development fallback defaults.

---

### 4. Silent Mock Fallback Data in Web Dashboard and Sandbox

- **Previous Failure**:
  - `apps/web/src/app/page.tsx` caught API errors and silently returned hardcoded mock data, making the dashboard look fully operational even when the backend was offline or unauthenticated (`401`).
  - `apps/web/src/app/api/sandbox/route.ts` returned hardcoded mock responses when the backend failed or was unreachable.
- **Solution Applied**:
  - `page.tsx`: Removed the silent catch fallback. Added an explicit, visible error banner component (`Failed to load live dashboard data: ...`) with an authenticated retry prompt, and explicit loading skeletons.
  - `api/sandbox/route.ts`: Removed mock fallbacks. Added error propagation returning upstream status codes (`400`, `401`, `502`) with actionable JSON error messages.

---

### 5. Missing `GET /api/v1/tool-call-traces` Endpoint

- **Previous Failure**: Documented in the README and required by the frontend execution detail view (`/executions/[id]`), but missing from `apps/api/src/modules/agent-executions/agentExecutionRoutes.ts`.
- **Solution Applied**:
  - Implemented `GET /api/v1/tool-call-traces` in `agentExecutionRoutes.ts` and `AgentExecutionService.listToolCallTraces`.
  - Supports pagination (`limit` default 50, max 100; `page` default 1), optional filtering by `executionId`, and strict tenant isolation (queries always enforce `organizationId`).
  - Added 4 comprehensive integration tests verifying pagination, execution filtering, and cross-tenant access rejection.

---

### 6. Unsafe Body & Parameter Type Casting in API Routes

- **Previous Failure**:
  - `apps/api/src/modules/eval-runs/evalRunRoutes.ts:95` used `request.params as { id: string }` instead of Zod parsing.
  - `apps/web/src/app/api/sandbox/route.ts` forwarded unvalidated JSON body parameters directly to downstream endpoints.
- **Solution Applied**:
  - `evalRunRoutes.ts`: Added `runEvalCaseParamsSchema.parse(request.params)`.
  - `apps/web/src/app/api/sandbox/route.ts`: Defined `sandboxBodySchema` with Zod, validating `agentType` (`support_agent`, `coding_agent`, `research_agent`), optional `action`, `executionId`, and `input`. Returns HTTP 400 with detailed schema violation messages. Added 6 automated tests in `apps/web/test/smoke.test.ts`.

---

### 7. MCP Server Cookie Prefix Authentication Hack

- **Previous Failure**: The Model Context Protocol server previously attempted to authenticate by prefixing tokens into a synthetic cookie string (`cookie: agentready_session=...`), breaking external agent tool discovery.
- **Solution Applied**:
  - Standardized on RFC 6750 `Authorization: Bearer <api_key>` machine authentication.
  - Stored API keys are validated using SHA-256 hashes against `ApiKey` records with scoped permissions (`tools:read`, `tools:execute`).
  - Added subprocess stdio tests in `apps/mcp-server/test/mcpServer.test.ts`.

---

### 8. Prisma Migrate Reset Prompt on Cloud Databases

- **Previous Failure**: Running `pnpm db:migrate` (`prisma migrate dev`) against an active cloud database (e.g. Supabase) detected existing schemas and prompted interactively: `Do you want to reset your database? (y/N)`. In non-interactive terminals, this halted execution.
- **Solution Applied**:
  - For cloud/hosted databases, developers should use `pnpm db:push` (`prisma db push`), which non-destructively synchronizes the Prisma schema with the remote database without resetting tables or prompting.
  - Documented both tracks in `README.md` and added `pnpm db:push` script at root.

---

## Active Operational Constraints & Guidelines

### 1. Production Secret Protection
- **Session Secret**: `AUTH_SESSION_SECRET` must be at least 32 characters. In production (`NODE_ENV=production`), Zod validation prevents starting the API if the secret is missing or set to the development default (`"development-auth-session-secret-change-me"`).
- **Sandbox Key**: `SANDBOX_AGENT_API_KEY` is checked at runtime. If running in production with an unset key or default value (`"ar_dev_demo_agent_key_change_me"`), calls will fail fast with a configuration error.

### 2. Dual Authentication Model
- **Browser Users**: Authenticate via `POST /api/v1/auth/login` to receive a signed, HTTP-only `agentready_session` cookie (`SameSite=Lax`, `Secure` in production).
- **Machine Agents**: Authenticate via `Authorization: Bearer <api_key>`. Keys are prefixed with `ar_live_` (production) or `ar_test_` (staging/testing) and checked against SHA-256 database hashes.
- **Server-Derived Tenancy**: Protected API routes derive `organizationId` from `request.authContext`. Never trust client-supplied `organizationId` in request bodies.

### 3. Database Schema Regeneration
- After modifying `prisma/schema.prisma`:
  1. Run `pnpm db:validate` to check schema syntax.
  2. Run `pnpm db:generate` to regenerate `@agentready/db` TypeScript types.
  3. Run `pnpm db:push` (for cloud Postgres) or `pnpm db:migrate` (for local Docker Postgres).
  4. Run `pnpm db:seed` to repopulate initial tenant and capability data.

### 4. Prisma Compound Unique Constraints with Nullable Fields
- Prisma's generated compound query types enforce that compound unique fields cannot be `null` in an `upsert` call (e.g. `@@unique([organizationId, agentId, capability])` where `agentId` is optional).
- **Pattern**: When querying or creating records where part of a compound key can be null, use `findFirst({ where: { ... } })` followed by explicit `create` or `update` rather than `upsert`.

### 5. Mock DB Client vs Real PostgreSQL Testing
- **Unit Tests (`pnpm test`, 128 tests)**: Run against `apps/api/test/mockPrisma.ts` using an in-memory `MockStore` for sub-second developer feedback with zero Docker requirement. Array-based query mocks do not simulate SQL constraints or concurrency.
- **Real PostgreSQL Integration Tests (`pnpm test:integration`, 10 tests)**: Provision an isolated `postgres:16-alpine` container via Testcontainers. Validates composite unique constraints (`ApiKey.keyHash`, `IdempotencyKey [executionId, key]`, `ToolCallTrace [executionId, toolCallId]`), AuditLog retention (`SetNull` on user/agent deletion) vs cascade (`Cascade` on org deletion), real Fastify + Postgres Bearer token auth, and concurrent worker claim races. Requires Docker with no automatic fallback.
