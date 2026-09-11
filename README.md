# 🛡️ AgentReady

> **The Agent-First Governance & Observability Platform for Autonomous AI Agents & LLM Tools.**

[![TypeScript](https://img.shields.io/badge/TypeScript-5.6-blue.svg)](https://www.typescriptlang.org/)
[![Next.js](https://img.shields.io/badge/Next.js-15-black.svg)](https://nextjs.org/)
[![Fastify](https://img.shields.io/badge/Fastify-5.0-green.svg)](https://fastify.dev/)
[![Prisma](https://img.shields.io/badge/Prisma-6.1-indigo.svg)](https://www.prisma.io/)
[![MCP](https://img.shields.io/badge/MCP-Protocol-purple.svg)](https://modelcontextprotocol.io/)
[![Tests](https://img.shields.io/badge/Tests-192%20passing-brightgreen.svg)](https://github.com/Deadeye102000/Agentready)
[![License](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

---

## 📌 Executive Summary

**AgentReady** is an agent-first B2B SaaS platform designed to make software execution by autonomous AI agents **safe, observable, testable, and auditable**.

As AI agents transition from passive chatbots to active software operators executing API calls, database writes, and financial transactions, giving them raw, unmonitored credentials presents major operational and security risks. AgentReady acts as a governed middleware, policy enforcement layer, and real-time observation platform between autonomous AI models and downstream enterprise infrastructure.

```
┌─────────────────┐       ┌────────────────────────────────────────────────────────┐       ┌───────────────────────┐
│                 │       │                     AGENTREADY                         │       │                       │
│  AI Agents /    │ ─────>│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  │ ─────>│  Enterprise APIs /    │
│  LLM Workflows  │       │  │ Governance   │  │ State Machine│  │ Model Context│  │       │  Databases / Services │
│  (LangGraph/MCP)│ <─────│  │ Policy Gates │  │ & Tracing    │  │ Protocol     │  │ <─────│                       │
└─────────────────┘       │  └──────────────┘  └──────────────┘  └──────────────┘  │       └───────────────────────┘
                          └────────────────────────────────────────────────────────┘
```

---

## 🚀 Key Features & Capabilities

### 🛡️ Governance & Policy Enforcement
- **Approval Gates**: Dynamic policy enforcement modes per tool or action:
  - `AUTOMATIC`: Instant execution without human intervention.
  - `REQUIRE_APPROVAL`: Intercepts high-risk actions, suspends execution state, generates an interactive `ApprovalRequest`, and waits for human authorization.
  - `BLOCKED`: Instantly denies unauthorized or risky tool invocations (`403 Forbidden`).
- **Risk Score Thresholds**: Evaluation of action risk levels (0-100) against configurable org policy thresholds.
- **Hierarchical Feature Flags**: Scoped at organization and agent-specific levels to instantly toggle capabilities (`agent_execution`, `tool_execution`, `eval_runner`, `mcp_server_access`, `auto_approval`).

### 🚦 Deterministic Execution State Machine
- **Lifecycle Engine**: Strict state transitions managed by `assertExecutionTransition`:
  $$\text{QUEUED} \longrightarrow \text{RUNNING} \longrightarrow \text{WAITING\_FOR\_APPROVAL} \longrightarrow \{\text{SUCCEEDED} \mid \text{FAILED} \mid \text{CANCELLED}\}$$
- **Atomic Worker Claims**: Async background runner polling `QUEUED` executions and claiming them safely under database concurrency constraints.

### ⚡ Model Context Protocol (MCP) Server
- Implements standard MCP (`@modelcontextprotocol/sdk`) over stdio transport.
- **Context Discovery**: Read-only tools (`list_available_tools`, `list_task_contracts`, `get_contract_context`, `get_execution_status`).
- **Gated Execution**: Write action (`start_execution`) automatically checks organization approval gates and feature flags before creating runs.

### 🔍 Real-Time Observability & Tool Tracing
- Granular step-by-step recording of `ToolCallTrace` events.
- Captures input/output payloads, execution latency (ms), risk scores, and status flags (`SUCCESS`, `BLOCKED`, `PENDING_APPROVAL`, `ERROR`).
- Visual execution timeline with status badges and error summary cards (`/executions/[id]`).

### 📊 Continuous Trajectory Evaluation & Regression Engine
- **Trajectory Policies**: State machine sequence rules (`trajectoryPolicy`) embedded on `TaskContract` defining strictly expected execution trajectories, required steps, parameter limits, and forbidden tool calls. Fully configurable over HTTP via `POST /api/v1/task-contracts` and `PATCH /api/v1/task-contracts/:id` by Owner/Admin, or initialized via seed routines.
- **Pure Deterministic Evaluator (`@agentready/agent-contracts`)**: Zero-LLM sequence matcher comparing actual tool call sequences against contracts, returning compliance scores (0.0 to 1.0) and explicit violation logs.
- **Composite Scoring Formula**:
  $$\text{Score} = \frac{\text{StatusMatch} + \text{ToolsMatch} + \text{TrajectoryScore}}{3}$$
  *(With backward-compatible fallback to 2-way formula when no trajectory policy is defined).*
- **Headless CLI Regression Runner (`pnpm eval:regression`)**: Standalone CI/CD test runner with ANSI side-by-side trajectory diffing, regression delta tracking, and pipeline gate exit codes (`0` for pass, `1` for policy breach).
- **FinTech Adversarial Test Suite**: Seeded canonical FinTech refund governance contract with 5 continuous evaluation cases testing golden paths, tool injection, trajectory bypasses, parameter tampering, and credential exfiltration.

### 🔐 Multi-Tenancy, Auth & RBAC
- **Tenant Isolation**: Server-derived organizational context (`organizationId`). Composite query parameters prevent cross-tenant data leaks.
- **Session Authentication**: HMAC-SHA256 signed stateless session cookies (`agentready_session`) with `scrypt` password hashing.
- **Machine Authentication**: SHA-256 hashed API Keys for Bearer token authorization (`AGENT` role).
- **Role-Based Access Control (RBAC)**: Fine-grained permissions for `OWNER`, `ADMIN`, `MEMBER`, `VIEWER`, and `APPROVER` roles.

### 🔌 External Agent Integration
AgentReady is designed to be called by independently-built AI agents (e.g. LangGraph-based) over its public REST API using Bearer-token machine authentication (see API Keys section). It provides the governed integration surface and observation layer for external agents, rather than bundling pre-packaged agent implementations within this repository.

### 💻 Modern Web Dashboard & Public Showcase
- Next.js 15 responsive UI styled with modern dark gradients and clean design tokens.
- **Enterprise Public Showcase & Landing Page (`/landing`)**: Dark obsidian cybernetic design educating stakeholders on the modern AI agent threat surface (*Unsafe Multi-Agent Delegation*, *Over-Privileged Tool Execution*, *Prompt Injection Trajectory Drift*, *Black-Box Handoffs*), interactive code/policy/trace console tabs, ecosystem compatibility grid, and real-time performance metrics (< 4ms pre-flight check latency, 0-LLM deterministic scoring).
- **Authentication-Aware Dynamic Routing**: Unauthenticated visitors accessing the root `/` URL are seamlessly served the public product landing page without requiring a backend session; authenticated operators automatically enter the full operational dashboard.
- **4 Primary Overview KPI Cards**: Real-time high-impact telemetry for *Total Executions*, *Success Rate*, *Pending Approvals* (action-required indicator), and *Eval Compliance*.
- **System Health Ribbon**: Live status indicators for connected MCP Servers, active Approval Gates, guarded Capability Flags, and Tool Traces volume.
- **Collapsible Interactive Sandbox (`SandboxController`)**: Embedded simulation console allowing one-click demonstrations of approval gates, rogue capability interception, and continuous regression evaluations.
- **Two-Column Executive Workspace**: Balanced layout dividing live operations (pending approval reviews, recent executions) and continuous compliance (evaluation regression deltas, active runtime guardrails).
- **Interactive Approval Queue (`/approval-queue`)**: Inline authorization modals with rejection note requirements.

---

## 🏗️ Architecture & Monorepo Structure

AgentReady is structured as a **TypeScript monorepo** managed with `pnpm` workspaces:

```mermaid
graph TD
    apps/web[apps/web<br>Next.js 15 Dashboard] --> packages/shared
    apps/api[apps/api<br>Fastify Backend API] --> packages/shared
    apps/api --> packages/db
    apps/api --> packages/auth
    apps/api --> packages/agent-contracts
    apps/mcp-server[apps/mcp-server<br>Model Context Protocol Server] --> packages/shared
    
    packages/db --> Prisma[Prisma ORM & PostgreSQL]
    packages/auth --> Crypto[scrypt & HMAC Crypto]
    packages/agent-contracts --> Contracts[Zod Task Schemas]
```

### Directory Workspace Layout

```
Agentready/
├── apps/
│   ├── api/             # Fastify REST API backend (Port 3001)
│   ├── web/             # Next.js 15 frontend dashboard (Port 3000)
│   └── mcp-server/      # Model Context Protocol stdio server
├── packages/
│   ├── db/              # Prisma schema, client generator & database utilities
│   ├── shared/          # Shared TypeScript interfaces, types & Zod schemas
│   ├── auth/            # Hashing (scrypt) & session signature routines
│   └── agent-contracts/ # Data structures for agent task contracts
├── prisma/
│   └── schema.prisma    # Complete Prisma data models
└── docs/                # Comprehensive developer documentation
```

---

## 📡 API Endpoints Reference

> [!IMPORTANT]
> **Human Governance Invariant (No Machine Self-Governance)**:
> Administrative and policy-defining routes (`POST /task-contracts`, `PATCH /task-contracts/:id`, `PUT /feature-flags`, `PUT /approval-gates`, `POST /api-keys`, etc.) require human interactive session authentication (`OWNER` or `ADMIN` role). Machine API keys—even those possessing wildcard (`*`, `all`, `admin`) scopes—are **strictly rejected with 403 Forbidden** on administrative routes to guarantee that autonomous agents cannot tamper with or bypass the governance boundaries, feature flags, and approval gates that constrain them. Conversely, machine execution callbacks (`POST /tool-calls/:traceId/result`) require machine Bearer authentication and reject human sessions.

| Category | Method | Endpoint Path | Description | Access |
|:---|:---:|:---|:---|:---|
| **Auth** | `POST` | `/api/v1/auth/register` | Register user + new organization | Public |
| **Auth** | `POST` | `/api/v1/auth/login` | Authenticate & issue HMAC session cookie | Public |
| **Auth** | `POST` | `/api/v1/auth/logout` | Revoke active user session | Session |
| **Auth** | `GET` | `/api/v1/auth/me` | Fetch active session & user details | Session |
| **Executions** | `POST` | `/api/v1/executions` | Trigger new agent execution | Session (Member+) / Agent (`executions:write`) |
| **Executions** | `GET` | `/api/v1/executions` | List org executions (with pagination/filters) | Session / Agent (`executions:read`) |
| **Executions** | `GET` | `/api/v1/executions/:id` | Get execution details & trace history | Session / Agent (`executions:read`) |
| **Executions** | `PATCH` | `/api/v1/executions/:id` | Transition execution status | Session (Member+) / Agent (`executions:write`) |
| **Tool Governance**| `POST` | `/api/v1/executions/:id/tool-calls/check` | Pre-flight tool check against policy gates & single-flight lock | Session (Member+) / Agent (`tool_calls:check`) |
| **Tool Governance**| `POST` | `/api/v1/tool-calls/:traceId/result` | Report synchronous tool execution result | Machine API Key only (`tool_calls:result`), Sessions not permitted |
| **Tool Traces**| `GET` | `/api/v1/tool-call-traces` | List tool call traces for an execution (with pagination) | Session / Agent (`traces:read` or `executions:read`) |
| **Tool Traces**| `POST` | `/api/v1/tool-call-traces` | Record per-step tool trace event | Session (Member+) / Agent (`traces:write`) |
| **Tool Traces**| `PATCH` | `/api/v1/tool-call-traces/:id` | Update per-step tool trace | Session (Member+) / Agent (`traces:write`) |
| **Contracts**  | `POST` | `/api/v1/task-contracts` | Create new agent task contract & trajectory policy | Session (Owner/Admin) only, API keys not permitted |
| **Contracts**  | `PATCH`| `/api/v1/task-contracts/:id` | Update task contract & trajectory policy | Session (Owner/Admin) only, API keys not permitted |
| **Contracts**  | `GET` | `/api/v1/task-contracts` | List task contracts | Session / Agent (`contracts:read`) |
| **Contracts**  | `GET` | `/api/v1/task-contracts/:id` | Get task contract by ID | Session / Agent (`contracts:read`) |
| **Governance** | `GET` | `/api/v1/approval-gates` | List policy approval gates | Session / Agent (`governance:read`) |
| **Governance** | `PUT` | `/api/v1/approval-gates` | Upsert approval gate rule | Session (Owner/Admin) only, API keys not permitted |
| **Governance** | `GET` | `/api/v1/feature-flags` | List active feature flags | Session / Agent (`governance:read`) |
| **Governance** | `PUT` | `/api/v1/feature-flags` | Upsert feature flag rule | Session (Owner/Admin) only, API keys not permitted |
| **Governance** | `POST` | `/api/v1/feature-flags/toggle` | Toggle feature flag state | Session (Owner/Admin) only, API keys not permitted |
| **Governance** | `GET` | `/api/v1/approval-requests` | List pending approval requests | Session / Agent (`governance:read`) |
| **Governance** | `POST` | `/api/v1/approval-requests/:id/review` | Approve or reject pending request | Session (Owner/Admin/Approver) only, API keys not permitted |
| **Governance** | `GET` | `/api/v1/mcp-servers` | List registered MCP server gateways | Session / Agent (`governance:read`) |
| **Evals**      | `POST` | `/api/v1/eval-runs` | Create single eval run | Session (Member+) / Agent (`eval:write`) |
| **Evals**      | `GET` | `/api/v1/eval-runs` | List evaluation runs | Session / Agent (`eval:read`) |
| **Evals**      | `GET` | `/api/v1/eval-runs/regression` | Fetch evaluation regression comparison | Session / Agent (`eval:read`) |
| **Eval Cases** | `POST` | `/api/v1/eval-cases` | Define new evaluation test case | Session (Owner/Admin) only, API keys not permitted |
| **Eval Cases** | `GET` | `/api/v1/eval-cases` | List registered evaluation test cases | Session / Agent (`eval:read`) |
| **Eval Cases** | `POST` | `/api/v1/eval-cases/:id/run` | Execute single evaluation case | Session (Member+) / Agent (`eval:write`) |
| **Eval Cases** | `POST` | `/api/v1/eval-suites/run` | Run complete evaluation suite | Session (Member+) / Agent (`eval:write`) |
| **Observability**| `GET` | `/api/v1/observability/dashboard` | Fetch aggregated KPI dashboard metrics | Session / Agent (`observability:read`) |
| **Audit Logs** | `GET` | `/api/v1/audit-logs` | Query organization audit trail | Session / Agent (`audit:read`) |
| **API Keys**   | `POST` | `/api/v1/api-keys` | Generate new machine API Key | Session (Owner/Admin) only, API keys not permitted |
| **API Keys**   | `GET` | `/api/v1/api-keys` | List organization API Keys | Session (Owner/Admin) only, API keys not permitted |
| **API Keys**   | `DELETE` | `/api/v1/api-keys/:id` | Revoke machine API Key | Session (Owner/Admin) only, API keys not permitted |

---

## 🗄️ Database Schema Summary (Prisma)

```mermaid
erDiagram
    Organization ||--o{ User : contains
    Organization ||--o{ AgentIdentity : owns
    Organization ||--o{ Project : groups
    Organization ||--o{ TaskContract : defines
    Organization ||--o{ AgentExecution : runs
    Organization ||--o{ AuditLog : records
    Organization ||--o{ AgentFeatureFlag : configures
    Organization ||--o{ ApprovalGate : enforces
    Organization ||--o{ ApiKey : authenticates

    AgentExecution ||--o{ ToolCallTrace : logs
    AgentExecution ||--o{ ApprovalRequest : suspends
    TaskContract ||--o{ EvalCase : tests
    EvalCase ||--o{ EvalRun : measures
```

| Entity | Purpose | Key Relations & Attributes |
|:---|:---|:---|
| **Organization** | Primary multi-tenant boundary | Root owner for users, agents, projects, flags, and logs |
| **User / OrgMember** | Human account & team membership | Linked via `OrganizationMember` with roles (`OWNER`, `ADMIN`, `MEMBER`, `VIEWER`, `APPROVER`) |
| **AgentIdentity** | Registered autonomous AI agent | Organization-scoped agent metadata & API credentials |
| **Project / Task** | Contextual grouping | Links agent execution objectives to enterprise workflows |
| **TaskContract** | Executable agent policy contract | Defines allowed tools, input Zod schemas, expected criteria, and risk scores |
| **AgentExecution** | Execution run instance | Tracks state machine (`QUEUED` $\to$ `SUCCEEDED`), duration, riskScore, output |
| **ToolCallTrace** | Per-step tool invocation trace | Tool name, input/output payload summaries, latency (ms), gate status |
| **ApprovalRequest** | Suspended human authorization | Action name, payload, status (`PENDING`, `APPROVED`, `REJECTED`), reviewer ID, note |
| **AuditLog** | Immutable audit log entry | Synchronous record of actor type (`USER`, `AGENT`, `SYSTEM`), action, diff payload |
| **AgentFeatureFlag**| Capability toggle | Scope (`ORG`, `AGENT`), feature key, state (`ENABLED`, `DISABLED`) |
| **ApprovalGate** | Risk policy gate | Action pattern, mode (`AUTOMATIC`, `REQUIRE_APPROVAL`, `BLOCKED`), riskLevel threshold |
| **EvalCase** | Evaluation test case | Expected execution status, target tools, assertions, contract link |
| **EvalRun** | Test execution result | Computed score (0.0-1.0), pass/fail status, delta metrics |
| **McpServerRegistration**| MCP Gateway registration | Server name, capabilities list, transport status |
| **ApiKey** | Machine Bearer key | Key prefix, SHA-256 `keyHash`, scopes, last used timestamp |

---

## 💻 Local Setup & Quickstart

### Prerequisites

- **Node.js**: `v18.0.0` or higher (tested on Node 20, 22, and 25)
- **pnpm**: `v9.0.0` or higher (`npm install -g pnpm`)
- **PostgreSQL Database** (Choose ONE of two options):
  - **Option A (Local Docker)**: Docker Desktop / Docker Engine (uses `docker-compose.yml`)
  - **Option B (Managed / Supabase / Neon / Cloud Postgres)**: No Docker required! Connection strings are configured directly in `.env`.
  *(Note: Running automated tests `pnpm test` requires NO database at all, as tests run against an in-memory mock engine).*

### Installation Steps

1. **Clone the repository and install dependencies**:
   ```bash
   git clone https://github.com/Deadeye102000/Agentready.git
   cd Agentready
   pnpm install
   ```
   > **Note**: `pnpm install` automatically triggers Prisma Client code generation (`pnpm db:generate`) via `postinstall`.

2. **Configure Environment Variables**:
   ```bash
   cp .env.example .env
   ```

   *Key `.env` configuration reference*:
   ```env
   NODE_ENV="development"
   API_PORT=3001
   API_HOST="0.0.0.0"
   API_CORS_ORIGINS="http://localhost:3000"
   AUTH_SESSION_SECRET="super-secret-development-hmac-key-32-chars-min"
   WEB_PORT=3000

   # For Local Docker PostgreSQL:
   DATABASE_URL="postgresql://agentready:agentready@localhost:5432/agentready?schema=public"
   DIRECT_URL="postgresql://agentready:agentready@localhost:5432/agentready?schema=public"

   # For Managed / Cloud PostgreSQL (e.g. Supabase):
   # DATABASE_URL="postgresql://postgres.[ref]:[password]@aws-0-[region].pooler.supabase.com:6543/postgres?pgbouncer=true"
   # DIRECT_URL="postgresql://postgres:[password]@db.[ref].supabase.co:5432/postgres"

   # Client & Server API URLs
   NEXT_PUBLIC_AGENTREADY_API_URL="http://localhost:3001"
   AGENTREADY_API_URL="http://localhost:3001"

   # MCP Server & Sandbox Machine Bearer API Keys
   AGENTREADY_API_KEY="ar_dev_demo_agent_key_change_me"
   AGENTREADY_AUTH_TOKEN="ar_dev_demo_agent_key_change_me" # Legacy alias for AGENTREADY_API_KEY
   SANDBOX_AGENT_API_KEY="ar_dev_demo_agent_key_change_me"
   ```

3. **Database Initialization**:

   Start local PostgreSQL in Docker, apply migrations, and seed baseline demo data:

   ```bash
   # 1. Start PostgreSQL container
   docker compose up -d postgres

   # 2. Run DB Migrations (applies initial schema + raw SQL triggers)
   pnpm db:migrate

   # 3. Seed Baseline Demo Data
   pnpm db:seed
   ```

   > [!WARNING]
   > **External PostgreSQL (Supabase / Neon / RDS)**:
   > If deploying against a remote managed PostgreSQL instance, apply migrations using:
   > ```bash
   > pnpm db:deploy
   > ```
   > **Do NOT use `prisma db push`**. `prisma db push` only synchronizes declarative models and ignores migration SQL files, silently skipping the PostgreSQL immutability trigger (`audit_log_prevent_update_delete`) and foreign key restrict constraint. Running `db push` on external databases leaves audit logs mutable.

   > **Seeded Credentials**:
   > - **Web Console Login**: `demo@agentready.local` / `agentready-demo-password`
   > - **Demo Agent API Key**: `ar_dev_demo_agent_key_change_me` (stored as SHA-256 hash)

4. **Launch Development Servers**:
   ```bash
   pnpm dev
   ```
   - 🌐 **Dashboard**: [http://localhost:3000](http://localhost:3000)
   - ⚡ **API Backend**: [http://localhost:3001](http://localhost:3001)

---

## 🧪 Testing & Verification

AgentReady implements a dual-tier testing strategy combining **fast in-memory unit tests** for rapid developer velocity and **containerized integration tests** for real PostgreSQL validation.

```bash
# 1. Run API unit tests (137 tests, 32 suites) — no Docker needed
pnpm test:api

# Run Trajectory Zod Contracts & Evaluator tests (2 tests, 1 suite)
pnpm --filter @agentready/agent-contracts test

# Run frontend smoke & data contract tests (35 tests, 9 suites)
pnpm test:web

# Run MCP server unit tests (3 tests, 1 suite)
pnpm test:mcp

# Run Headless CI/CD Trajectory Regression Runner (ANSI terminal diffs & exit codes)
pnpm eval:regression

# 2. Run real PostgreSQL integration tests (15 tests, 4 suites) — requires Docker
pnpm test:integration

# Run TypeScript static typecheck across all workspaces
pnpm typecheck

# Verify production build compilation
pnpm build
```

### Test Suite Summary (224 Total Tests, 0 Failures)

The test suite covers **224 total tests across 50 suites**, split into two distinct execution tiers:

#### Tier 1: Unit & Contract Suite (209 Tests across 46 Suites — `pnpm test:api / test:web / test:mcp / --filter @agentready/agent-contracts test`)
*API and contract tests run in ~2.8 seconds using Node's native test runner and an in-memory Prisma mock store (`mockPrisma.ts`). Requires zero Docker or database dependencies.*

| Test Suite | Tests | Target File | Features Covered |
|:---|:---:|:---|:---|
| **Auth Suite** | 5 | [`apps/api/test/auth.test.ts`](apps/api/test/auth.test.ts) | User registration, login, session validation, cookie issuance |
| **Execution State Machine** | 6 | [`apps/api/test/execution-state-machine.test.ts`](apps/api/test/execution-state-machine.test.ts) | Valid/invalid state transitions, terminal status protection |
| **Tenancy Isolation** | 3 | [`apps/api/test/tenancy.test.ts`](apps/api/test/tenancy.test.ts) | Cross-org boundary checks, 404 existence privacy masks |
| **Feature Flags** | 6 | [`apps/api/test/feature-flags.test.ts`](apps/api/test/feature-flags.test.ts) | Flag overrides, state toggles, audit logs, auto-approval override |
| **Approval Gates** | 9 | [`apps/api/test/approval-gates.test.ts`](apps/api/test/approval-gates.test.ts) | Policy pattern matching, risk thresholds, approval suspension |
| **Approval Webhooks** | 3 | [`apps/api/test/approvalWebhook.test.ts`](apps/api/test/approvalWebhook.test.ts) | Deduplicated dispatch, HMAC-SHA256 signature verification, exponential retry exhaustion audit log |
| **Eval Framework** | 8 | [`apps/api/test/eval-framework.test.ts`](apps/api/test/eval-framework.test.ts) | Test case definition, scoring formula, suite & single case runs, 60/min rate limiting, audit logging |
| **Eval Regression** | 1 | [`apps/api/test/regression.test.ts`](apps/api/test/regression.test.ts) | Delta calculation, newly failing/passing metric comparisons |
| **Eval Trajectory Service** | 2 | [`apps/api/test/eval-trajectory-service.test.ts`](apps/api/test/eval-trajectory-service.test.ts) | Deterministic trajectory compliance calculation, policy adherence, composite scoring fallback |
| **Adversarial & Trajectory Evals** | 4 | [`apps/api/test/adversarial-evals.test.ts`](apps/api/test/adversarial-evals.test.ts) | FinTech Refund Governance contract, tool parameter boundary checks, forbidden tool execution blocking |
| **Critical E2E Flows** | 11 | [`apps/api/test/critical-flows.test.ts`](apps/api/test/critical-flows.test.ts) | End-to-end flow: Register → Contract → Execution → Trace → Approval → Eval |
| **Tool Call Traces Endpoint** | 4 | [`apps/api/test/toolCallTraces.test.ts`](apps/api/test/toolCallTraces.test.ts) | GET `/api/v1/tool-call-traces` listing, filtering, pagination, tenant isolation |
| **Sync Tool Call Governance** | 9 | [`apps/api/test/toolCallGovernance.test.ts`](apps/api/test/toolCallGovernance.test.ts) | Synchronous tool execution, lifecycle state transitions, single-flight locks, idempotency |
| **Background Worker** | 5 | [`apps/api/test/worker.test.ts`](apps/api/test/worker.test.ts) | Atomic DB claim polling, concurrency isolation, CONFIG_ERROR fast-fail, webhook dispatch |
| **Idempotency Purge** | 3 | [`apps/api/test/idempotencyPurge.test.ts`](apps/api/test/idempotencyPurge.test.ts) | Expired idempotency key cleanup and audit logging |
| **RBAC Protection** | 12 | [`apps/api/test/rbac.test.ts`](apps/api/test/rbac.test.ts) | Endpoint role gating (`OWNER`, `ADMIN`, `MEMBER`, `VIEWER`, `APPROVER`), mid-session demotion (403), membership removal (401) |
| **RBAC Route Matrix** | 19 | [`apps/api/test/rbacMatrix.test.ts`](apps/api/test/rbacMatrix.test.ts) | Parameterized matrix: unauthenticated 401, VIEWER read-only, MEMBER ops boundary, PATCH task-contract trajectory policy mutation, scoped API key, machine-only boundary |
| **API Key Scope Enforcement** | 18 | [`apps/api/test/scopes.test.ts`](apps/api/test/scopes.test.ts) | `hasScope` unit tests, route enforcement per scope, wildcard scope rejection (Human Governance Invariant) |
| **API Keys & Machine Auth** | 7 | [`apps/api/test/api-keys.test.ts`](apps/api/test/api-keys.test.ts) | Key generation, Bearer header token resolution, hash storage, invalid scope rejection (400) |
| **Env Validation** | 5 | [`apps/api/test/env.test.ts`](apps/api/test/env.test.ts) | Production-mode validation: rejects unset or default `AUTH_SESSION_SECRET` |
| **Trajectory Evaluator Engine** | 22 | [`packages/agent-contracts/test/evaluator.test.ts`](packages/agent-contracts/test/evaluator.test.ts) | Pure sequence matcher, exact step order, 20 shared cross-language fixtures (`STRICT_SEQUENCE`, `SUBSEQUENCE`, `UNORDERED`) |
| **Frontend Smoke & Contracts** | 36 | [`apps/web/test/smoke.test.ts`](apps/web/test/smoke.test.ts) | Data contract validation, state enums, fallback math, sandbox rate-limit (429), `patchTaskContract` API |
| **MCP Server Stdio Tests** | 3 | [`apps/mcp-server/test/mcpServer.test.ts`](apps/mcp-server/test/mcpServer.test.ts) | Bearer API key auth, stdio subprocess spawn, missing credential rejection |
| **MCP Server SSE Transport Tests** | 8 | [`apps/mcp-server/test/sseTransport.test.ts`](apps/mcp-server/test/sseTransport.test.ts) | Query-string key rejection (400), header auth, single-use session tokens (30s TTL), rate limiting (429), E2E tool calls |

#### Tier 2: Real PostgreSQL Integration Suite (15 Tests across 4 Suites — `pnpm test:integration`)
*Runs against an ephemeral `postgres:16-alpine` instance provisioned by Testcontainers (`@testcontainers/postgresql`). Applies all migrations from empty on every run. **Docker is a hard requirement with no automatic fallback**.*

| Test Suite | Tests | Target File | Features Covered |
|:---|:---:|:---|:---|
| **Composite Constraints & Audit Retention** | 4 | [`apps/api/test-integration/constraints.integration.test.ts`](apps/api/test-integration/constraints.integration.test.ts) | Real Postgres `P2002` violations on `ApiKey.keyHash`; AuditLog retention (`onDelete: SetNull`) on User/Agent deletion; org deletion **blocked** (`onDelete: Restrict`) while AuditLogs exist |
| **Real Fastify & Postgres MCP Auth** | 5 | [`apps/api/test-integration/mcp-auth.integration.test.ts`](apps/api/test-integration/mcp-auth.integration.test.ts) | End-to-end tool execution, SHA-256 database lookup, tenant isolation, DB `lastUsedAt` update, 401 on unregistered/revoked/expired keys |
| **Concurrent Claim Race** | 1 | [`apps/api/test-integration/concurrency.integration.test.ts`](apps/api/test-integration/concurrency.integration.test.ts) | 10 parallel `PrismaClient` worker connections racing atomic `updateMany` claiming 20 queued executions with 0 double-claims |
| **Role Revocation & AuditLog Integrity** | 5 | [`apps/api/test-integration/rbac-revocation.integration.test.ts`](apps/api/test-integration/rbac-revocation.integration.test.ts) | Real Postgres: ADMIN→VIEWER demotion takes effect on next request; membership removal denies access; FK `RESTRICT` blocks org deletion with audit logs; immutability trigger blocks UPDATE/DELETE in real Postgres |

#### 🔄 Continuous Integration & Pull Request Quality Gate (`.github/workflows/agent-regression.yml`)

Every pull request against `master` and `main` is gated by the **Agent Regression & Quality Gate** GitHub Actions workflow:

- **Ephemeral PostgreSQL 16 Service Container**: Spun up on port 5432 with health checks, schema migrations (`pnpm db:deploy`), and seed contracts (`pnpm db:seed`).
- **Required Quality Checks**:
  1. `pnpm typecheck` (zero TypeScript compilation errors across all workspace packages)
  2. `pnpm test:api` (140 API unit tests, RBAC matrices, approval webhooks, and state machine transitions)
  3. `pnpm test:web` (36 Next.js smoke & data contract tests)
  4. `pnpm test:mcp` (11 MCP server unit & SSE transport tests)
  5. `pnpm --filter @agentready/agent-contracts test` (22 Trajectory evaluator tests & cross-language fixtures)
  6. `pnpm eval:regression` (**Continuous Trajectory Regression Gate** — exits with non-zero code if any trajectory policy violation, forbidden tool call, or score regression is detected)
  7. `pnpm test:integration` (15 real PostgreSQL integration tests against Testcontainers)
- **Deployment Invariant**: Any trajectory violation or test failure fails the GitHub Actions check and blocks PR merge.

---

## 🔔 Real-time Approval Webhooks & HMAC Verification Recipe

AgentReady emits real-time HTTP webhooks whenever human approval requests are created or reviewed.

### Invariants & Architecture
1. **Single-Point Insert Dedup**: Exactly one webhook is dispatched per `ApprovalRequest` record created, directly triggered within `governanceRepository.createApprovalRequest()`. High-level callers (`recordToolCall`, `checkToolCall`, `createApprovalRequest`) cannot cause duplicate notifications.
2. **Reliable Retry Schedule**: Deliveries are retried up to 3 times (total 4 attempts) with exponential backoff (`1s`, `2s`, `4s`). Webhook execution runs asynchronously in the background so slow or failing webhook targets never block or fail the synchronous execution path.
3. **Audit Log Failure Exhaustion**: If all 4 delivery attempts fail, an immutable PostgreSQL `AuditLog` row is created with action `approval.webhook_delivery_failed`, recording the target URL, attempt count, request ID, and the final error message.

### Exact HMAC-SHA256 Signing Recipe

Each webhook request includes cryptographic headers allowing receivers to verify payload integrity, authenticity, and protect against replay attacks:

| Header | Format | Description |
|:---|:---|:---|
| `x-agentready-signature` | `sha256=<hex_digest>` | HMAC-SHA256 hex digest over `${timestamp}.${rawJsonBody}` |
| `x-agentready-timestamp` | `<epoch_seconds>` | UTC timestamp integer (seconds since Unix epoch) |
| `x-agentready-event-id` | `<uuid>` | Unique delivery event identifier |
| `Content-Type` | `application/json` | JSON payload MIME type |

#### Receiver Verification Recipe (TypeScript / Node.js)
```typescript
import crypto from "node:crypto";

export function verifyAgentReadyWebhook(
  rawBody: string,
  headers: Record<string, string | string[] | undefined>,
  secret: string,
  toleranceSeconds = 300 // 5 minutes replay protection
): boolean {
  const signatureHeader = headers["x-agentready-signature"] as string;
  const timestampHeader = headers["x-agentready-timestamp"] as string;

  if (!signatureHeader || !timestampHeader) return false;

  const timestamp = parseInt(timestampHeader, 10);
  if (isNaN(timestamp)) return false;

  // 1. Replay attack prevention: reject timestamps older than tolerance
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - timestamp) > toleranceSeconds) {
    return false;
  }

  // 2. Compute expected HMAC-SHA256 signature
  const expectedSig = crypto
    .createHmac("sha256", secret)
    .update(`${timestamp}.${rawBody}`)
    .digest("hex");

  // 3. Extract received signature digest
  const prefix = "sha256=";
  if (!signatureHeader.startsWith(prefix)) return false;
  const receivedSig = signatureHeader.slice(prefix.length);

  // 4. Timing-safe comparison to protect against side-channel attacks
  if (expectedSig.length !== receivedSig.length) return false;
  return crypto.timingSafeEqual(Buffer.from(expectedSig), Buffer.from(receivedSig));
}
```

#### Receiver Verification Recipe (Python)
```python
import hmac
import hashlib
import time

def verify_agentready_webhook(raw_body: bytes, headers: dict, secret: str, tolerance_seconds: int = 300) -> bool:
    sig_header = headers.get("x-agentready-signature")
    timestamp_header = headers.get("x-agentready-timestamp")
    if not sig_header or not timestamp_header:
        return False
    
    try:
        timestamp = int(timestamp_header)
    except ValueError:
        return False

    if abs(time.time() - timestamp) > tolerance_seconds:
        return False  # Replay detected

    payload_to_sign = f"{timestamp}.".encode("utf-8") + raw_body
    expected_sig = hmac.new(secret.encode("utf-8"), payload_to_sign, hashlib.sha256).hexdigest()
    
    prefix = "sha256="
    if not sig_header.startswith(prefix):
        return False
    received_sig = sig_header[len(prefix):]
    
    return hmac.compare_digest(expected_sig, received_sig)
```

---

## 🔌 Model Context Protocol (MCP) Server & SSE Transport

The AgentReady MCP Server exposes tool governance capabilities and context inspection over two standard transports:

1. **Stdio Transport**: Subprocess communication for local IDE extensions (Claude Desktop, Cursor, VS Code):
   ```bash
   pnpm --filter @agentready/mcp-server dev
   ```
2. **Server-Sent Events (SSE) HTTP Transport**: Distributed HTTP/SSE server for network clients:
   ```bash
   node apps/mcp-server/dist/index.js --transport=sse --port=3002
   ```

### Security & Rate-Limiting Discipline for SSE
- **Header-Only Authentication**: Authorization is required via `Authorization: Bearer <api_key>` on both `GET /sse` and `POST /message`. Long-lived API keys in query parameters (`?api_key=...`) are strictly forbidden and immediately rejected with **400 Bad Request** to prevent credential leakage in HTTP access logs.
- **Single-Use Session Tokens for Browser Clients**: For browser `EventSource` clients unable to set custom request headers, a short-lived single-use session token can be minted via `POST /sse/session` (with `Authorization: Bearer <key>`), returning `{ sessionToken, expiresAt }` (30-second TTL). The client connects via `GET /sse?session_token=<token>`, which is immediately consumed and invalidated upon connection handshake.
- **Connection-Count Rate Limiting**: Max **5 concurrent active SSE connections** per client key/IP (returns `429 Too Many Requests` with `Retry-After: 5`).
- **Handshake Frequency Rate Limiting**: Max **30 handshakes per minute** per client key/IP (returns `429 Too Many Requests` with `Retry-After: 60`).

---

## 🗺️ Roadmap & Future Expansion Plans

- [x] **Core Monorepo Scaffold & Multi-Tenancy Architecture**
- [x] **Stateless HMAC Sessions & Password Hashing (`scrypt`)**
- [x] **Agent Execution Lifecycle Engine & State Machine**
- [x] **Policy Governance: Approval Gates & Hierarchical Feature Flags**
- [x] **Awaited Synchronous Audit Logging (Immutable — `BEFORE UPDATE/DELETE` trigger + `onDelete: Restrict`)**
- [x] **Deterministic Evaluation & Regression Delta Suite**
- [x] **Continuous Trajectory Policy Engine & Pure Sequence Matcher (`@agentready/agent-contracts`)**
- [x] **Adversarial & Boundary Evaluation Suite (FinTech Refund Governance benchmark)**
- [x] **Standalone Headless CI/CD Regression Runner CLI (`pnpm eval:regression`)**
- [x] **Model Context Protocol (MCP) Server Integration**
- [x] **Redesigned Executive Overview Dashboard** — Clean 4-card KPI layout, system health ribbon, collapsible simulator console
- [x] **Role-Based Access Control (RBAC) & Bearer Machine API Keys**
- [x] **Async Background Execution Worker**
- [x] **Audit Log UI (`/audit-logs`)** — Filterable table, actor type filter, JSON metadata drawer, immutability badge
- [x] **API Key Management UI (`/api-keys`)** — Granular scope picker (wildcard scopes blocked per Human Governance Invariant), secret reveal on creation
- [x] **Task Contract UI (`/task-contracts`)** — Contract cards, JSON spec inspector, Trajectory Policy viewer, interactive modal editor, creation modal
- [x] **Eval Suite UI (`/evals`)** — Regression KPIs, tabbed test cases / runs, live run trigger
- [x] **Real-time Webhook Notifications**: Push alerts for pending `ApprovalRequest` events with HMAC-SHA256 signatures, single-insert dedup, backoff retries, and audit-logged exhaustion.
- [x] **HTTP / SSE Transport for MCP Gateway**: Distributed Server-Sent Events transport with header auth, single-use session tokens, and connection rate limiting.
- [x] **Public Landing Page & Threat Showcase (`/landing`)**: High-impact cybernetic showcase with interactive policy-as-code console and authentication-aware routing.
- [ ] **Typed API Response Contracts**: Shared response types across frontend & backend via `@agentready/shared`.
- [ ] **Password Reset & Team Invite Workflows**: Email token-based credential recovery and team onboarding flows.
- [ ] **Custom LLM Judge Scoring**: Integrate non-deterministic LLM-as-a-judge scoring for complex agent evaluation criteria.
- [ ] **Audited Org Archival API**: Superuser/service-role endpoint that exports `AuditLog` records to external immutable storage prior to deletion and writes a dedicated, untamperable record of the archival event (required before tenant offboarding/org deletion can be safely permitted).

---

## 📚 Project Documentation

For deeper architectural details, deployment instructions, and troubleshooting:

1. 📖 **[Implementation Context & Handoff Guide](docs/implementation-context.md)** — Detailed module layouts, DB schemas, API endpoints, and test coverage mapping.
2. 📐 **[Technical Reference Document](docs/technical-reference.md)** — Code snippets for Prisma schemas, machine auth hooks, and policy matching rules.
3. 🚀 **[Production Deployment Guide](docs/deployment-ready.md)** — Step-by-step production deployment checklist and environment variables.
4. 🔧 **[Local Setup & Troubleshooting Guide](docs/known-setup-issues.md)** — Solutions for local setup constraints and mock DB setup.
5. 🎨 **[Product & Design Guide](docs/interview-guide.md)** — Conceptual specifications, user personas, and design decisions.

---

## 📄 License

Distributed under the MIT License. See `LICENSE` for more information.
