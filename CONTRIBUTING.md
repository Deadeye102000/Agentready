# Contributing to AgentReady

Thank you for your interest in contributing to **AgentReady**! This guide outlines the development workflow, testing standards, and architecture expectations.

---

## 🛠️ Development Setup

### Prerequisites
- **Node.js**: `v20` or higher
- **pnpm**: `v9.0.0` or higher (`npm install -g pnpm`)
- **Docker**: Required **only** if you plan to run local database services via `docker compose` or run the real-DB integration test suite (`pnpm test:integration`).

### Initial Setup
```bash
# 1. Clone repository
git clone https://github.com/Deadeye102000/Agentready.git
cd Agentready

# 2. Install dependencies (triggers Prisma client generation)
pnpm install

# 3. Setup environment variables
cp .env.example .env
```

---

## 🧪 Testing Guidelines

AgentReady enforces a dual-tier testing architecture: **Fast Unit Tests** for developer velocity, and **Containerized Integration Tests** for real database integrity.

### 1. Fast Unit Tests (`pnpm test`)
- **Command**: `pnpm test` (or `pnpm test:api`, `pnpm test:web`, `pnpm test:mcp`)
- **Docker Requirement**: **None**. Runs 100% in-memory without Docker or network dependencies.
- **Coverage**: 128 tests across 28 suites (96 API, 29 Web, 3 MCP).
- **Engine**: In-memory Prisma mock store (`mockPrisma.ts`) simulating standard CRUD operations and state transitions with sub-second execution times.

### 2. Real PostgreSQL Integration Tests (`pnpm test:integration`)
- **Command**: `pnpm test:integration`
- **Docker Requirement**: ⚠️ **DOCKER IS A HARD REQUIREMENT WITH NO AUTOMATIC FALLBACK**.
- **Coverage**: 10 tests across 3 suites (4 constraints, 5 MCP auth, 1 concurrency).
- **Combined Suite**: **138 total tests across 31 suites (0 failures)**.
- **Rationale**: In-memory mocks cannot validate PostgreSQL-level guarantees such as composite unique constraints (`@@unique`), foreign key lifecycle actions (`onDelete: SetNull` vs `onDelete: Cascade`), row-level atomic locking, or true connection pool saturation.
- **How It Operates**:
  - Automatically provisions isolated PostgreSQL containers using **Testcontainers** (`@testcontainers/postgresql`, `postgres:16-alpine`).
  - **Reaper / Cleanup**: Utilizes Testcontainers' built-in Ryuk reaper container to guarantee zero orphan containers on unexpected crashes, combined with an explicit `afterAll` teardown (`teardownEphemeralPostgres()`) on normal exits.
  - **Connection Limits**: Explicitly sets `connection_limit=20` on the container connection string (exceeding the 10-worker concurrency load) to ensure requests are not serialized through a default client pool, guaranteeing genuine parallel database connections.
  - **No Fallback**: If Docker is unavailable or the daemon is not running, the test suite halts immediately with an explicit error rather than silently falling back to mocks or local schemas.

#### Integration Test Paths Covered:
1. **Composite Constraints & Foreign Key Lifecycles** (`constraints.integration.test.ts`):
   - Real `P2002` unique violation on duplicate `ApiKey.keyHash`.
   - Real composite unique constraint on `IdempotencyKey [executionId, key]`.
   - Real composite unique constraint on `ToolCallTrace [executionId, toolCallId]`.
   - **AuditLog Retention vs. Tenant Cascade**:
     - Deleting a `User` or `AgentIdentity` retains all audit records with `actorUserId = null` or `actorAgentId = null` (`onDelete: SetNull`), preserving compliance audit trails.
     - Deleting an `Organization` cascades and purges tenant audit records (`onDelete: Cascade`) for multi-tenant data deletion compliance.
2. **MCP Server Real Auth Flow End-to-End** (`mcp-auth.integration.test.ts`):
   - Fastify HTTP server bound to real PostgreSQL database.
   - MCP client issues tool invocations (`list_task_contracts`, `list_available_tools`).
   - Fastify executes real SHA-256 hash lookup in Postgres, verifies expiration and revocation status, updates `lastUsedAt`, and enforces tenant isolation.
   - Asserts rejection (`401 Unauthorized`) for missing, invalid, expired, or revoked keys.
3. **Concurrent Execution Claims** (`concurrency.integration.test.ts`):
   - 10 distinct `PrismaClient` connections simultaneously race to claim 20 `QUEUED` executions via atomic `updateMany`.
   - Proves zero double-claiming, exactly 20 successful transitions to `RUNNING`, and consistent state under real PostgreSQL concurrency.

---

## 🔒 RBAC & Security Invariants

When adding or modifying API routes, strictly adhere to the enforced role boundaries:
- **`POST /api/v1/task-contracts`**: Strictly restricted to `OWNER` and `ADMIN` (`requireRole(["OWNER", "ADMIN"])`). `MEMBER`, `APPROVER`, and `VIEWER` are denied (403).
- **`POST /api/v1/eval-cases`**: Strictly restricted to `OWNER` and `ADMIN` (`requireRole(["OWNER", "ADMIN"])`).
- **`POST /api/v1/approval-requests/:id/review`**: Restricted to `OWNER`, `ADMIN`, and `APPROVER`.
- **`POST /api/v1/api-keys`**: Restricted to `OWNER` and `ADMIN`.
- **`MEMBER`**: Permitted to initiate executions and execute eval runs.
- **`VIEWER`**: Read-only access across the dashboard and API.
- **MCP Server Auth**: External agents authenticate via `Authorization: Bearer <api_key>` (`AGENTREADY_API_KEY`). Never use session cookies or synthetic cookie headers for machine authentication.

---

## 💻 Pull Request Standards

Before opening a pull request, ensure the following checks pass locally:

```bash
# 1. Static Type Checking
pnpm typecheck

# 2. Unit Test Suite (128 passing tests)
pnpm test

# 3. Integration Test Suite (requires Docker)
pnpm test:integration

# 4. Production Build Verification
pnpm build
```

### Commit Message Conventions
We follow conventional commit format:
- `feat:` New features or public API changes
- `fix:` Bug fixes or security patch resolutions
- `test:` Test additions, suites, or refactoring
- `docs:` Documentation updates and guides
- `refactor:` Code restructuring without behavior changes
