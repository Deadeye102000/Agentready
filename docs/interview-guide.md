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

Approval gates define policy for risky capabilities. A capability can be automatic, require approval, or be blocked.

### What are feature flags?

Feature flags control which agent can use which capability. This prevents agents from accessing tools that are not explicitly enabled.

### Why have both gates and flags?

Feature flags answer “can this agent use this capability at all?” Approval gates answer “does this capability require human review or policy blocking?”

### Where are these checked?

They are checked in `AgentExecutionService.recordToolCall` before storing the final tool-call trace status.

## 9. Eval And Observability Questions

### What is an EvalRun?

An eval run records whether an execution or contract passed a set of checks. It includes score, threshold, checks, findings, and status.

### What does the dashboard show?

The dashboard aggregates current organization data:

- execution counts
- waiting approvals
- tool-call counts
- blocked calls
- eval pass rate
- recent executions
- recent tool calls
- eval runs
- approval gates
- feature flags
- MCP registration status

### How is dashboard data protected?

The observability route uses authenticated org context and the repository aggregates only by that organization ID.

## 10. Database And Prisma Questions

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

## 11. Frontend Questions

### What is implemented on the frontend?

The frontend currently has a Next.js dashboard at `apps/web/src/app/page.tsx`. It renders agent observability data and falls back to demo-shaped data if the API is unavailable.

### Why no login UI yet?

The current work prioritized API auth and tenant safety. A login/register UI is a natural next phase.

### What frontend risk remains?

The frontend currently defines dashboard types locally instead of consuming shared API response types. That should be cleaned up as the API stabilizes.

## 12. Testing And Quality Questions

### What checks currently pass?

The repo has been verified with:

- `pnpm typecheck`
- `pnpm build`
- Prisma schema validation

### What tests are still needed?

Priority tests:

- auth register/login/current-user
- protected route rejects unauthenticated requests
- cross-org access returns 403/404
- relation ownership checks reject foreign IDs
- execution state machine rejects invalid transitions
- tool calls always create traces
- approval gates and feature flags block/approve correctly
- observability aggregates only current org data

## 13. Tradeoff Questions

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

## 14. Weak Spots To Be Honest About

### What would you improve next?

1. Add route and service tests.
2. Add role-based authorization.
3. Add login/register frontend.
4. Add idempotency middleware.
5. Add migration files and seed hardening.
6. Add worker abstraction for queued executions.
7. Add typed API response contracts.
8. Add audit events for auth and trace updates.

### What is not production-ready yet?

The foundation is production-minded, but not complete. Missing areas include RBAC, password reset, SSO, test coverage, observability infrastructure, background workers, deployment hardening, and migration workflow.

## 15. Strong Closing Pitch

AgentReady is built around the idea that companies will not trust agents just because they can call tools. They will trust agents when every action is scoped, authorized, traced, evaluated, and auditable. This codebase establishes that foundation as a modular monolith, keeping the system simple today while preserving clean seams for workers, MCP support, eval infrastructure, and enterprise governance later.
