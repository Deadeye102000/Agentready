# AgentReady Interview Guide

This document prepares you to explain AgentReady in interviews, reviews, demos, or technical walkthroughs. It covers product need, architecture, security, tenancy, agent harness design, tradeoffs, and likely follow-up questions.

## 1. Product And Problem Questions

### What is AgentReady?

AgentReady is an agent-first B2B SaaS platform that helps companies make their existing software usable, safe, observable, and testable for AI agents. It provides an execution harness, task contracts, tool-call tracing, eval runs, approval gates, feature flags, audit logs, and an observability dashboard.

### What problem does it solve?

AI agents are starting to operate software on behalf of humans, but most SaaS systems were built for human clicks, not autonomous tool use. Companies need a way to define what agents are allowed to do, trace every action, test agent behavior, require approvals for risky actions, and audit outcomes.

### Why does this need to exist?

Without a harness, agent behavior is hard to control. A company cannot confidently answer:

- What did the agent try to do?
- Which tools did it call?
- Did it follow the task contract?
- Did it access the right tenant data?
- Did it require approval before risky actions?
- Did it pass evals?
- Who or what authorized the action?

AgentReady turns agent use from an ad hoc integration into an governed operating layer.

### Who is the customer?

The target customer is a company adopting AI agents inside internal or customer-facing software. Likely users include platform teams, AI product teams, security teams, QA/eval teams, and operations teams.

### What is the wedge?

The wedge is agent observability plus safety controls: task contracts, tool-call traces, approval gates, and eval runs. A company can start by wrapping high-risk agent workflows before expanding into broader MCP/server integrations.

## 2. Architecture Questions

### What architecture does the repo use?

AgentReady is a TypeScript monorepo:

- `apps/web`: Next.js frontend
- `apps/api`: Fastify backend
- `apps/mcp-server`: Model Context Protocol (MCP) server
- `packages/db`: Prisma client/schema package
- `packages/shared`: shared Zod schemas and common contract types
- `packages/auth`: password hashing and session helpers
- `packages/agent-contracts`: Zod schemas and types for task contracts

### Why a modular monolith instead of microservices?

The product domain is still forming. A modular monolith gives clear boundaries without introducing distributed systems complexity too early. The API is organized into domain modules with route/service/repository separation, which keeps the code extraction-ready if a module later needs to become a separate service.

### What are the API modules?

Current modules under `apps/api/src/modules`:

- `auth`: register, login, logout, current user, session parsing
- `tenancy`: ownership checks for org-scoped related records
- `task-contracts`: contract creation and retrieval
- `agent-executions`: execution lifecycle, state transitions, traces
- `eval-runs`: eval run creation and listing
- `governance`: approval gates, feature flags, approval requests, MCP registrations
- `observability`: dashboard aggregation
- `audit`: audit log persistence

### What pattern do modules follow?

Modules follow a route/service/repository/schema pattern:

- `*Routes.ts`: parses input, gets auth org context, calls service
- `*Schemas.ts`: Zod schemas for route inputs
- `*Service.ts`: business rules and orchestration
- `*Repository.ts`: Prisma access

### Why keep business logic out of routes?

Routes should be thin adapters. Business behavior belongs in services so it can be tested, reused, and eventually extracted. This also avoids scattering security and policy logic across request handlers.

## 3. Authentication And Security Questions

### How does authentication work?

AgentReady enforces a dual-authentication model supporting both human dashboard users and autonomous machine agents:

1. **Human User Sessions (Browser Dashboard)**:
   - Email/password authentication where passwords are encrypted using Node's `scrypt`.
   - Sessions are stateless, signed with HMAC-SHA256, and stored in HTTP-only cookies (`session`).
   - Cookies use `SameSite=Lax`, strict `maxAge`, and `Secure` in production.

2. **Machine Agent API Keys (Autonomous Agents & SDKs)**:
   - Bearer token authentication via `Authorization: Bearer <api-key>`.
   - Keys follow standard prefix formats: `ar_live_` (production) or `ar_test_` (sandbox/staging).
   - Keys are **never stored in plaintext**; the database stores only SHA-256 cryptographic digests (`crypto.createHash("sha256").update(rawKey).digest("hex")`).
   - Granular, strictly-enforced scopes: `executions:read`, `executions:write`, `eval:read`, `eval:write`, `contracts:read`, `governance:read`, `admin`, `all`.
   - Preserved in `request.authContext.scopes` and enforced per-route via `requireScope()` pre-handlers (human session users remain unaffected).
   - Resolved automatically in Fastify request pre-handlers via `machineAuthPlugin` and `authPlugin`.

### How does Role-Based Access Control (RBAC) work?

The platform enforces a 5-tier hierarchical RBAC model across tenant organizations:
- `OWNER`: Full administrative control, billing, API key management, and member role assignment.
- `ADMIN`: Policy management, feature flags, approval gates, and configuration.
- `APPROVER`: Authorized to review and approve/reject pending execution requests (`POST /api/v1/approval-requests/:id/review`).
- `OPERATOR`: Permitted to initiate agent executions and execute evaluation runs.
- `VIEWER`: Read-only access to dashboard metrics, execution histories, and audit logs.

Routes enforce RBAC via `requireRole(request.authContext, MinimumRole)` middleware. If a user does not have the required role or belongs to a different organization, a standardized `403 FORBIDDEN` error is returned.

### How is the app protected against running with hardcoded default secrets in production?

To prevent catastrophic silent fallback to known developer secrets in live environments:
1. **API Environment Hardening (`apps/api/src/lib/env.ts`)**:
   - `AUTH_SESSION_SECRET` uses Zod refinement rules. When `NODE_ENV === "production"`, it is strictly validated: if missing or left as `"development-auth-session-secret-change-me"`, Zod immediately throws an error:
     ```
     AUTH_SESSION_SECRET is required in production and must not use the development default
     ```
   - Because `env.ts` is imported on line 1 of `index.ts` prior to Fastify initialization, the API fails to start with exit code 1.
2. **Web Sandbox Route Protection (`apps/web/src/lib/sandboxAuth.ts`)**:
   - `SANDBOX_AGENT_API_KEY` is checked at runtime when `NODE_ENV === "production"`. If unset or equal to `"ar_dev_demo_agent_key_change_me"`, an explicit error is thrown rather than silently authenticating requests.
3. **Local Dev Velocity**:
   - In non-production environments (`NODE_ENV !== "production"`), both components retain safe developer default fallbacks so new contributors can run `pnpm dev` immediately without manual environment file setup.

### Where is auth logic located?

- Crypto & session signing: `packages/auth`.
- Fastify auth & session parsing: `apps/api/src/modules/auth/authPlugin.ts`.
- Machine API key verification & hashing: `apps/api/src/modules/auth/machineAuthPlugin.ts` & `authService.ts`.
- RBAC permissions & role hierarchies: `apps/api/src/modules/auth/rbac.ts`.
- Web client auth & proxying: `apps/web/src/lib/sandboxAuth.ts` and `apps/web/src/lib/api/auth.ts`.

### What is still missing for enterprise auth?

Future enterprise enhancements:
- SSO/SAML 2.0 / OIDC integrations (Okta, Google Workspace, Azure AD)
- Multi-factor authentication (MFA / TOTP)
- SCIM directory synchronization for automated user offboarding
- Ephemeral session revocation and token blacklisting
- Team invite and self-service password reset flows

### What API security hardening is in place?

The API uses environment-validated CORS, request body size limits, security headers, and rate limiting. CORS rejects wildcard origins because credentialed auth cookies are enabled. Global rate limits apply to the API, with stricter limits for login and register endpoints.

### How are API errors standardized?

The API has one central Fastify error handler. It normalizes `HttpError`, Zod validation errors, Prisma known errors, body-limit errors, rate-limit errors, CORS errors, and internal failures into:

```json
{
  "error": {
    "code": "...",
    "message": "...",
    "details": {}
  }
}
```

Each error response includes a `requestId` in `details`. Production responses do not expose stack traces.

## 4. Tenancy Questions

### How is multi-tenancy modeled?

B2B resources include `organizationId`. The authenticated session contains the current `organizationId`, and protected routes derive tenant scope from auth context rather than trusting request bodies.

### How do protected routes enforce tenancy?

Protected routes call `requireOrgContext(request)` and attach `organizationId: context.organizationId` to service calls. Route schemas omit `organizationId` from protected request bodies.

### How do you avoid cross-organization relation leaks?

The `tenancy` module validates related IDs before create operations. For example, creating an agent execution checks that the project, task, contract, and agent belong to the authenticated organization.

### Why not trust `organizationId` from the client?

Because a malicious client could submit another organization’s ID. Tenant context must come from the authenticated session or a trusted server-side mechanism.

### What tenancy risks remain?

Tenancy boundary enforcement has been codified and locked with automated integration tests (`apps/api/test/tenancy.test.ts`), confirming that cross-org execution fetches return `404 NOT_FOUND` and cross-org foreign ID injection returns `403 FORBIDDEN`. User-level RBAC is also now enforced via `requireRole` middleware. The remaining risk is ensuring newly added modules strictly use `TenancyService` and never bypass org scoping in direct repository queries.

### How does tenancy interact with request bodies?

Protected route schemas omit `organizationId`. The API derives `organizationId` from `request.authContext` and passes it into services. This prevents a client from selecting another tenant by changing a request body or query parameter.

## 5. Agent Harness Questions

### What is an Agent Execution?

An `AgentExecution` represents a single attempt by an agent to perform a task or contract. It stores objective, input, output, risk score, status, timestamps, and links to traces and eval runs.

### Why model execution as a state machine?

Agent runs are long-running and risk-sensitive. A state machine prevents invalid lifecycle transitions and makes background worker processing deterministic and resilient.

### What are the execution states?

Current states:

- `QUEUED`
- `RUNNING`
- `WAITING_FOR_APPROVAL`
- `SUCCEEDED`
- `FAILED`
- `CANCELLED`

### Where are transitions enforced?

Transitions are centralized in `agent-executions/executionStateMachine.ts`. Services call `assertExecutionTransition` before updating status. Terminal states (`SUCCEEDED`, `FAILED`, `CANCELLED`) reject all subsequent transitions.

### Why is `QUEUED` important?

It allows the API to acknowledge and persist execution creation immediately with sub-millisecond response latency, handing off actual execution to an asynchronous worker without changing the external model or blocking the client request thread.

### How does the Background Execution Worker work?

The background execution runner (`apps/api/src/modules/workers/executionRunner.ts` and `workerPlugin.ts`) operates directly inside the API process without external queue dependencies:
1. **Lifecycle Integration**: Wrapped as a Fastify plugin (`workerPlugin`). Fastify's `onReady` hook starts the poller interval; the `onClose` hook stops the timer and drains active runs for graceful shutdown.
2. **Atomic Claiming**: On each tick, the worker polls for executions in `QUEUED` state. It atomically updates their status to `RUNNING` and writes a `SYSTEM` audit log (`agent_execution.status_changed`).
3. **Harness Execution**: The claimed execution runs through the `InProcessExecutionRunner`. Upon contract completion or tool-call termination, it asserts valid transitions and writes the final status (`SUCCEEDED` or `FAILED`).
4. **Extraction Seam**: Because all polling, claiming, and transitions use repository abstractions, this worker can be extracted into an external standalone worker process or backed by Redis/BullMQ/Temporal with zero changes to the core execution model.

## 6. Task Contracts Questions

### What is a Task Contract?

A task contract defines what an agent is supposed to do. It includes objective, inputs, success criteria, allowed tools, required approvals, and eval specification.

### Why are task contracts separate from tasks?

Tasks are work items. Contracts define the rules and expectations for agent execution. Keeping them separate allows versioning and repeatable evals.

### Why use Zod schemas?

Zod gives runtime validation and TypeScript inference. It helps keep API contracts explicit and shared across modules/packages.

## 7. Tool-Call Trace Questions

### What is a ToolCallTrace?

A `ToolCallTrace` records an individual tool call attempted by an agent. It stores tool name, input, output, error, status, latency, approval link, and timestamps.

### Are tool calls always traced?

The intended path is `AgentExecutionService.recordToolCall`, which always creates a trace. This is the controlled service path for tool calls. Future tests should lock this down.

### What happens when a tool call is risky?

The service checks feature flags and approval gates. If a capability is disabled or blocked, the trace is stored with `BLOCKED`. If approval is required, an approval request is created and the execution can move to `WAITING_FOR_APPROVAL`.

## 8. Approval Gates And Feature Flags

### What are approval gates?

Approval gates define policy for risky capabilities. A capability can be automatic, require approval, or be blocked. They support enabling/disabling, matching capability patterns/wildcards (e.g. `file_*`), and a `riskLevel` integer setting to threshold risk scores.

### What happens when an approval gate is triggered?

When a tool trace is recorded and its capability matches a gate requiring manual review:
1. A new `ApprovalRequest` is created in `PENDING` state.
2. The trace status is set to `BLOCKED` with the error `approval_requested`.
3. The parent agent execution pauses, transitioning to `WAITING_FOR_APPROVAL`.
4. A trace event records the request.
The execution remains paused until an administrator approves or rejects the request via `POST /api/v1/approval-requests/:id/review`.

### What are feature flags?

Feature flags control system capabilities on an organization-wide and agent-specific level. They are evaluated hierarchically (agent-specific override takes precedence, falling back to organization-wide defaults).

### What capabilities do feature flags control?

Feature flags control five key system functions:
1. `agent_execution`: Disables creation of executions globally or per agent.
2. `tool_execution`: Completely blocks executing custom integration tools.
3. `eval_runner`: Prevents running assertions or creating evaluation reports.
4. `mcp_server_access`: Restricts viewing or communicating with registered Model Context Protocol servers.
5. `auto_approval`: Overrides all `AUTOMATIC` approval gates to require manual human approval if disabled.

### Where are these checked?

They are checked at runtime:
- `agent_execution`: Checked at execution creation.
- `tool_execution` and `auto_approval`: Checked during tool trace recordings.
- `eval_runner`: Checked at evaluation runs creation.
- `mcp_server_access`: Checked when listing MCP servers.

## 9. Audit Logging Questions

### What sensitive actions are audited?

Current audited actions include:

- `auth.registered`
- `auth.logged_in`
- `auth.logged_out`
- `task_contract.created`
- `agent_execution.created`
- `agent_execution.status_changed`
- `tool_call_trace.recorded`
- `tool_call_trace.updated`
- `eval_run.created`
- `approval_gate.upserted`
- `feature_flag.upserted`
- `approval_request.reviewed`

### What metadata does an audit log capture?

Audit logs are scoped by `organizationId` and can include actor user ID, actor agent ID, action, resource type, resource ID, source, and before/after metadata where practical.

### What does `source` mean in audit metadata?

`source` describes the origin of the action:

- `HUMAN`: user-driven action
- `AGENT`: agent-driven action
- `SYSTEM`: platform/system action

The Prisma `actorType` still uses the existing enum values: `USER`, `AGENT`, or `SYSTEM`.

### How can audit logs be queried?

The API exposes `GET /api/v1/audit-logs`, protected by auth and scoped to the current organization. It returns recent audit logs and supports an optional `limit` query parameter capped at 100.

### Are audit failures ignored?

No. Audit writes for critical sensitive actions are awaited. If the database audit write fails, the core action is allowed to fail rather than silently pretending it was audited.

## 10. Eval And Observability Questions

### What is an EvalCase?

An `EvalCase` represents a test case for an agent. It defines a `taskContractId`, an input payload, an expected status, expected tools to be called, and success criteria.

### How are evaluations executed and scored?

Evaluations run case executions through the actual execution harness (creating an execution, transitioning from `QUEUED` to `RUNNING` to terminal state, and recording tool call traces). They are scored deterministically by comparing the actual terminal status against `expectedStatus` (statusMatch) and the actual tool calls list against `expectedTools` (toolsMatch).
The formula is: `score = (statusMatch + toolsMatch) / 2` (range 0.0 to 1.0). A case passes if `score === 1.0`. Mismatches generate detailed failure reasons, checks lists, and findings.

### What is Eval Regression Comparison?

An evaluation regression comparison analyzes current run metrics against the immediate previous run metrics for each case in the contract or suite. It computes:
- Previous average score vs. current average score, and the delta change (worsened or improved).
- Previous pass rate vs. current pass rate, and the pass rate change.
- Newly failing cases (passed previously, now failed).
- Newly passing cases (failed previously, now passed).

### What does the dashboard show?

The dashboard aggregates current organization data:

- execution counts
- waiting approvals
- tool-call counts
- blocked calls
- eval pass rate
- evaluation regression analytics panel (comparing scores, pass rates, and newly passing/failing cases)
- recent executions
- recent tool calls
- eval runs
- approval gates
- feature flags
- MCP registration status

### How is dashboard data protected?

The observability route uses authenticated org context and the repository aggregates only by that organization ID.

## 11. Database And Prisma Questions

### Why Prisma?

Prisma gives type-safe database access and clear schema modeling. It fits the TypeScript monorepo and supports Postgres well.

### What are the most important models?

- `Organization`
- `User`
- `OrganizationMember`
- `AgentIdentity`
- `TaskContract`
- `AgentExecution`
- `ToolCallTrace`
- `EvalRun`
- `ApprovalGate`
- `AgentFeatureFlag`
- `ApprovalRequest`
- `AuditLog`
- `McpServerRegistration`

### What schema tradeoffs exist?

Some JSON fields are used for flexible agent payloads, such as inputs, outputs, eval checks, and metadata. This is useful early, but high-value fields may later become typed relational models.

## 12. Frontend Questions

### What is implemented on the frontend?

The frontend (`apps/web`) is a full Next.js 15 App Router dashboard with the following completed pages:

- **Overview dashboard** (`/`): 7 KPI metric cards (total executions, success rate, failed, pending approvals, eval pass rate, disabled critical flags, registered MCP servers), recent executions table, regression analytics card, recent tool calls, feature flags/gate status.
- **Execution detail** (`/executions/[id]`): Full execution metadata, ordered trace timeline, color-coded event status badges, failure reason display.
- **Approval Queue** (`/approval-queue`): Lists pending risky agent actions with approve/reject actions. Rejection requires a typed reason note. Status updates inline after decision.
- **Feature Flags** (`/feature-flags`): Toggle capability flags per agent or org-wide.
- **Login Page** (`/login`): Clean authentication form with client/server validation, connects to `POST /api/v1/auth/login`, receives session cookie, and redirects to dashboard.
- **Register Page** (`/register`): Tenant onboarding flow capturing Organization Name, User Name, Email, and Password; calls `POST /api/v1/auth/register` to establish the initial tenant and admin user.
- **Sandbox API Route Proxy** (`/api/sandbox`): Server-side App Router endpoint allowing test harness clients to execute sandboxed agent workflows, backed by `apps/web/src/lib/sandboxAuth.ts`.

The frontend uses a centralized API client (`apps/web/src/lib/api.ts`) with typed interfaces and fallback demo data for every endpoint.

### How does the approval queue work?

The `/approval-queue` page fetches `GET /api/v1/approval-requests?status=PENDING`. Approve calls `POST /api/v1/approval-requests/:id/review` with `{ status: "APPROVED" }`. Reject opens a modal requiring a non-empty note before calling the same endpoint with `{ status: "REJECTED", note }`. The card updates inline without a page reload.

### How does the frontend handle authentication and sessions?

`apps/web` uses HTTP-only cookie-based authentication. When a user logs in via `/login` or registers via `/register`, Fastify sets a signed HTTP-only `session` cookie. On subsequent requests, the browser attaches this cookie to backend calls or Next.js route handlers. The frontend client includes `getMe()` to fetch current user and organization details.

### What frontend risk remains?

Response types are defined locally in `api.ts` rather than imported from `packages/shared`. This should be consolidated as the API contracts stabilize.

## 13. Testing And Quality Questions

### What checks currently pass?

The repo is verified across all workspaces:
- `pnpm typecheck` (zero TypeScript errors across all 7 workspace projects)
- `pnpm build` (Next.js 15 production bundle + API TypeScript compilation succeed)
- `pnpm test` (all 114 tests pass, 0 failures, 100% passing)

### How many tests are there and how do they run?

**114 total tests** across two workspaces, using **Node's built-in test runner** (`node --import tsx --test`) — zero third-party test runners needed:

```bash
pnpm test        # all workspaces (114 tests)
pnpm test:api    # API integration tests (91 tests, 18 suites)
pnpm test:web    # Frontend smoke & auth tests (23 tests, 7 suites)
```

### What do the API integration tests cover?

18 comprehensive test suites in `apps/api/test`:
- **Auth** (5): registration, login, invalid credentials, session cookie verification, `/me` endpoint.
- **API Keys & Machine Auth** (6): key generation with prefix (`ar_live_` / `ar_test_`), SHA-256 database hashing, scoped permissions, invalid key rejection, session cookie vs Bearer key dual auth, audit logging on issuance and revocation (with strict secret exclusion).
- **API Key Scope Enforcement** (8): exact scope verification, resource wildcards (`executions:*`), full superuser scopes (`admin`, `all`), write route rejection for read-only keys (403), and immunity for session users.
- **Environment & Startup Protection** (5): missing `AUTH_SESSION_SECRET` fail-fast in production, fallback in dev, sub-process startup exit code 1.
- **Execution State Machine** (6): valid/invalid lifecycle transitions, terminal state protection.
- **Tenancy** (3): cross-org isolation, 403/404 boundary enforcement, foreign ID injection prevention.
- **Role-Based Access Control (RBAC)** (10): hierarchical role enforcement (Owner > Admin > Approver > Operator > Viewer), 403 on insufficient privilege for task contracts, eval cases, gates, and flags.
- **Background Execution Worker** (3): poller claiming `QUEUED` executions, atomic transition to `RUNNING`, `SYSTEM` audit log generation.
- **Synchronous Tool Call Governance & Lifecycle** (9): `/tool-calls/check` pre-flight gate, single-flight 409 enforcement, canonicalized argument hashing & secret redaction, state-based idempotency caching & mismatch 409, complete approval-then-resume path (AWAITING_APPROVAL -> APPROVED -> in-place PENDING transition -> CONSUMED approval -> result), reject & expire trace transitions to BLOCKED, circuit breaker trip after 3 consecutive blocks, dedicated scopes (`tool_calls:check`, `tool_calls:result`), and machine-only `/result` endpoint.
- **Approval Gates** (~11): wildcard gate patterns, risk thresholds, `WAITING_FOR_APPROVAL` pause, approval/rejection lifecycle.
- **Feature Flags** (6): blocked capabilities, toggle API, auto-approval override, audit log writes.
- **Eval Framework** (6): case creation, scoring formula, suite runs, flag-blocked eval.
- **Eval Regression** (1): delta computation, newly passing/failing case detection.
- **Critical Flows** (11): end-to-end chain — register→login→contract→execution→trace→gate→approve→reject→eval.

### What are the frontend smoke tests?

23 tests in `apps/web/test/smoke.test.ts` running without browser overhead:
- Fallback dashboard data shapes (all 8 metrics ≥ 0, required fields present)
- Approval request fallback data (correct fields, `PENDING` status, no secrets in payload)
- `ApiResult<T>` type contract shape
- All status values are known enum values (execution, tool call, eval)
- Regression data shape and delta arithmetic
- Feature flag and approval gate required fields and valid mode values
- **Sandbox Route Production Secret Protection** (4): verifies `getApiKey()` throws in production if `SANDBOX_AGENT_API_KEY` is unset or matches dev default, allows valid custom keys in production, and defaults safely in development.

### What is the automated test architecture?

All API tests use Fastify's `app.inject()` against a fully in-memory mock Prisma client (`apps/api/test/mockPrisma.ts`) — no live PostgreSQL required. Each test file calls `resetMockStore()` in `beforeEach` for full isolation between test cases.

### What tests are still needed?

- End-to-end browser/Playwright tests for complex UI approval workflows.
- Multi-instance distributed concurrency and race-condition tests.
- Load testing and rate-limit stress validation.

## 14. Tradeoff Questions

### Why not Kafka or Kubernetes?

The product does not need distributed infrastructure yet. The architecture is worker-ready through `QUEUED` executions and the `workerPlugin` abstraction, but adding Kafka or Kubernetes now would slow iteration and create unnecessary operational overhead.

### How can this scale later?

The modular monolith can scale by extracting modules:

- execution runner to a standalone worker service (e.g. backed by BullMQ/Temporal)
- observability to an analytics pipeline (ClickHouse/BigQuery)
- MCP interface to its own service
- auth to enterprise identity integration (SAML/SCIM)
- eval engine to an async processor

### What is the most important technical decision so far?

Treating agent activity as governed execution rather than generic CRUD. The core primitives are contracts, executions, traces, gates, evals, and audit logs.

## 15. Weak Spots To Be Honest About

### What was recently resolved?

Several previously identified weak spots have now been fully implemented and verified:
1. **Role-Based Access Control (RBAC)**: Implemented 5 hierarchical roles (`OWNER`, `ADMIN`, `APPROVER`, `OPERATOR`, `VIEWER`) and `requireRole` middleware.
2. **Frontend Auth UI**: Added `/login` and `/register` pages with session cookie handling.
3. **Execution Background Worker**: Added in-process `workerPlugin` polling and executing `QUEUED` tasks with atomic claiming.
4. **Production Secret Hardening**: Prevented silent fallback to hardcoded development secrets in production for both API and web apps.
5. **Machine API Keys**: Dual-auth layer with SHA-256 key hashing and scoped permissions.

### What would you improve next?

1. **Distributed Worker**: Replace the in-process interval runner with BullMQ or Temporal when horizontal API clustering is deployed.
2. **Shared Contract Types**: Consolidate frontend API client types into `packages/shared`.
3. **Frontend Audit Log UI**: Add a dedicated `/audit-logs` page for compliance viewing.
4. **Idempotency Keys**: Add idempotency middleware for non-idempotent write endpoints.
5. **Database Migration Pipeline**: Implement automated CI/CD migration checks and production seed verification.
6. **Enterprise Auth**: Add SSO/SAML 2.0 and SCIM directory sync.

### What is not production-ready yet?

The core logic and security boundaries are solid, but production readiness requires:
- A managed PostgreSQL instance with automated migration rollouts.
- Distributed queueing for multi-pod horizontal scaling.
- Enterprise SSO/SAML for B2B enterprise procurement.
- Playwright end-to-end browser tests.

## 16. Strong Closing Pitch

AgentReady is built around the idea that companies will not trust agents just because they can call tools. They will trust agents when every action is scoped, authorized, traced, evaluated, and auditable. This codebase establishes that foundation as a modular monolith, keeping the system simple today while preserving clean seams for background workers, eval infrastructure, and advanced enterprise governance later.

## 17. Graphify Architectural Intelligence (Code Graph Insights)

A complete structural knowledge graph of this repository was generated using the **Graphify** static analysis engine (`graphify-out/GRAPH_REPORT.md`), providing automated dependency analysis, community detection, and architectural insights.

### Repository Topology Metrics

- **Files Analyzed**: 116 source files (~51,517 words).
- **Graph Size**: 808 symbols/nodes, 1,557 dependency edges, 44 detected semantic communities.
- **Extraction Fidelity**: 91% extracted, 9% inferred, 0% ambiguous.
- **Cycle Health**: **0 import cycles detected** across the entire monorepo.

### The Top God Nodes (Core Abstractions by Centrality)

Graph analysis revealed the 5 most connected abstractions in the system (measured by edge degree and betweenness centrality):

| Node | Edges | Role & Architectural Impact |
| :--- | :--- | :--- |
| **`HttpError`** | 41 | **Highest betweenness centrality (0.028)** in the codebase. Functions as the universal cross-community bridge uniting error mapping, Fastify error handlers, domain services, and test assertions. |
| **`AuditService`** | 31 | **Betweenness centrality (0.015)**. Serves as the horizontal governance spine linking authentication, task contracts, executions, traces, approval gates, feature flags, evals, and worker lifecycles. |
| **`GovernanceRepository`** | 25 | The central persistence backbone for policy enforcement (approval gates, feature flags, and approval requests). |
| **`TenancyService`** | 24 | The multi-tenant boundary guardian verifying organization-scoped relation ownership across all modules. |
| **`AgentExecutionService` / `Repo`** | 22 / 21 | The operational engine orchestrating agent run lifecycles, state machine assertions, and tool-call tracing. |

### Key Architectural Questions Answered by the Graph

#### 1. Why does this modular monolith have zero circular dependencies?
Because dependencies flow strictly in one direction:
- Routes depend on Services and Schemas.
- Services depend on Repositories, State Machines, and Utilities.
- Repositories depend only on Prisma and Database client.
- Universal cross-cutting utilities (`HttpError`, `TenancyService`, `AuditService`) are injected or consumed as leaf abstractions without back-referencing routes or plugins.

#### 2. How does the Background Worker attach without coupling?
`buildServer()` in `server.ts` registers `workerPlugin()` via Fastify's plugin lifecycle. The worker interacts with `AgentExecutionService` and `AgentExecutionRepository` through standardized interfaces, keeping execution polling decoupled from request handling.

#### 3. Where are the highest-cohesion modules?
Leaf modules show exceptionally high internal cohesion:
- **Sandbox API Route Proxy**: Cohesion `0.70` (focused proxy layer with `sandboxAuth`).
- **Frontend Auth Pages & Session Client**: Cohesion `0.42` (`/login`, `/register`, `getMe()`).
- **Error Handling & Response Mapping**: Cohesion `0.33` (`HttpError`, `registerErrorHandlers`, Prisma mapper).
