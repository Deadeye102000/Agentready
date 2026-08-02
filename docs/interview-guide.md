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
- `apps/mcp-server`: future MCP interface
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

AgentReady uses email/password auth. Passwords are hashed using Node `scrypt`. Sessions are stateless, signed with HMAC, and stored in HTTP-only cookies.

### Why not use a full auth framework?

The current repo only needed a secure foundation: register, login, logout, current user, signed sessions, and org context. Adding a full framework would increase complexity before the product needs SSO, OAuth, SCIM, or enterprise identity.

### Where is auth logic located?

Crypto helpers live in `packages/auth`. API auth behavior lives in `apps/api/src/modules/auth`. Protected routes use `request.authContext`, which includes `userId` and `organizationId`.

### Why HTTP-only cookies?

HTTP-only cookies reduce exposure to frontend JavaScript and fit a browser-based SaaS dashboard. The cookie is signed, has a max age, uses `SameSite=Lax`, and uses `Secure` in production.

### What is still missing for enterprise auth?

Future work:

- SSO/SAML/OIDC
- MFA
- Session revocation
- Device/session management
- Password reset
- Invite flow
- Role-based access checks
- Audit logs for auth events

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

The next major step is automated tests for 401/403 behavior and cross-org relation rejection. Role checks are also still needed, because right now the system knows the organization but does not fully enforce user permissions inside that organization.

### How does tenancy interact with request bodies?

Protected route schemas omit `organizationId`. The API derives `organizationId` from `request.authContext` and passes it into services. This prevents a client from selecting another tenant by changing a request body or query parameter.

## 5. Agent Harness Questions

### What is an Agent Execution?

An `AgentExecution` represents a single attempt by an agent to perform a task or contract. It stores objective, input, output, risk score, status, timestamps, and links to traces and eval runs.

### Why model execution as a state machine?

Agent runs are long-running and risk-sensitive. A state machine prevents invalid lifecycle transitions and makes future background worker extraction easier.

### What are the execution states?

Current states:

- `QUEUED`
- `RUNNING`
- `WAITING_FOR_APPROVAL`
- `SUCCEEDED`
- `FAILED`
- `CANCELLED`

### Where are transitions enforced?

Transitions are centralized in `agent-executions/executionStateMachine.ts`. Services call `assertExecutionTransition` before updating status.

### Why is `QUEUED` important?

It allows the API to create work now and later move actual execution to a background worker without changing the external model.

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

The frontend (`apps/web`) is a full Next.js 15 dashboard with the following completed pages:

- **Overview dashboard** (`/`): 7 KPI metric cards (total executions, success rate, failed, pending approvals, eval pass rate, disabled critical flags, registered MCP servers), recent executions table, regression analytics card, recent tool calls, feature flags/gate status.
- **Execution detail** (`/executions/[id]`): Full execution metadata, ordered trace timeline, color-coded event status badges, failure reason display.
- **Approval Queue** (`/approval-queue`): Lists pending risky agent actions with approve/reject actions. Rejection requires a typed reason note. Status updates inline after decision.
- **Feature Flags** (`/feature-flags`): Toggle capability flags per agent or org-wide.

The frontend uses a centralized API client (`apps/web/src/lib/api.ts`) with typed interfaces and fallback demo data for every endpoint.

### How does the approval queue work?

The `/approval-queue` page fetches `GET /api/v1/approval-requests?status=PENDING`. Approve calls `POST /api/v1/approval-requests/:id/review` with `{ status: "APPROVED" }`. Reject opens a modal requiring a non-empty note before calling the same endpoint with `{ status: "REJECTED", note }`. The card updates inline without a page reload.

### Why no login UI yet?

The current work prioritized the full API governance and observability layer. A login/register UI (`/register`, `/login`) with session cookie wiring is the next frontend phase.

### What frontend risk remains?

Response types are defined locally in `api.ts` rather than shared from `packages/shared`. This should be consolidated as the API stabilizes.

## 13. Testing And Quality Questions

### What checks currently pass?

The repo has been fully verified with:
- `pnpm typecheck` (workspace-wide TypeScript checks)
- `pnpm build` (Next.js + API production bundles compile successfully)
- `pnpm test` (all 62 tests pass, 0 failures)

### How many tests are there and how do they run?

**62 total tests** across two workspaces, using **Node's built-in test runner** with `tsx` — no Jest, Vitest, or Mocha required:

```bash
pnpm test        # all workspaces
pnpm test:api    # API integration tests (43 tests, 10 suites)
pnpm test:web    # Frontend smoke tests (19 tests, 6 suites)
```

### What do the API integration tests cover?

- **Auth** (5): registration, login, invalid credentials, session cookie, `/me`
- **Execution State Machine** (6): valid/invalid lifecycle transitions, terminal state protection
- **Tenancy** (3): cross-org isolation, 403/404 boundary enforcement, foreign ID injection
- **Approval Gates** (~11): wildcard gate patterns, risk thresholds, WAITING_FOR_APPROVAL pause, approval/rejection lifecycle
- **Feature Flags** (6): blocked capabilities, toggle API, auto-approval override, audit log writes
- **Eval Framework** (6): case creation, scoring formula, suite runs, flag-blocked eval
- **Eval Regression** (1): delta computation, newly passing/failing case detection
- **Critical Flows** (11): end-to-end chain — register→login→contract→execution→trace→gate→approve→reject→eval

### What are the frontend smoke tests?

19 tests in `apps/web/test/smoke.test.ts` that run without a browser or jsdom. They verify:
- Fallback dashboard data shapes (all 8 metrics ≥ 0, required fields present)
- Approval request fallback data (correct fields, PENDING status, no secrets in payload)
- `ApiResult<T>` type contract shape
- All status values are known enum values (execution, tool call, eval)
- Regression data shape and delta arithmetic
- Feature flag and approval gate required fields and valid mode values

### What is the automated test architecture?

All tests use Fastify's `app.inject()` against a fully in-memory mock Prisma client (`apps/api/test/mockPrisma.ts`) — no live PostgreSQL required. Each test file calls `resetMockStore()` in `beforeEach` for full isolation between test cases.

### What tests are still needed?

- End-to-end browser/Playwright tests for UI flows
- Concurrency and race condition tests for execution workers
- Load testing and rate limit stress validation

## 14. Tradeoff Questions

### Why not Kafka or Kubernetes?

The product does not need distributed infrastructure yet. The architecture is worker-ready through `QUEUED` executions, but adding Kafka or Kubernetes now would slow iteration and create unnecessary operational complexity.

### How can this scale later?

The modular monolith can scale by extracting modules:

- execution runner to a worker
- observability to analytics pipeline
- MCP interface to its own service
- auth to enterprise identity integration
- eval engine to an async processor

### What is the most important technical decision so far?

Treating agent activity as governed execution rather than generic CRUD. The core primitives are contracts, executions, traces, gates, evals, and audit logs.

## 15. Weak Spots To Be Honest About

### What would you improve next?

1. Add role-based authorization (RBAC — OWNER/ADMIN/MEMBER/VIEWER enforcement).
2. Add login/register frontend screens.
3. Add execution background worker (poll `QUEUED` → transition to `RUNNING`).
4. Add typed API response contracts shared from `packages/shared`.
5. Add frontend audit log UI page.
6. Add idempotency middleware for non-idempotent writes.
7. Add migration files and seed hardening for production deployments.
8. Add password reset and team invite flows.

### What is not production-ready yet?

The foundation is production-minded but not complete. Missing: RBAC enforcement, password reset, SSO/SAML, full observability infrastructure, background workers, deployment hardening, migration workflow, and frontend auth screens.

## 16. Strong Closing Pitch

AgentReady is built around the idea that companies will not trust agents just because they can call tools. They will trust agents when every action is scoped, authorized, traced, evaluated, and auditable. This codebase establishes that foundation as a modular monolith, keeping the system simple today while preserving clean seams for workers, MCP support, eval infrastructure, and enterprise governance later.
