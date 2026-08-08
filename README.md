# 🛡️ AgentReady

> **The Agent-First Governance & Observability Platform for Autonomous AI Agents & LLM Tools.**

[![TypeScript](https://img.shields.io/badge/TypeScript-5.6-blue.svg)](https://www.typescriptlang.org/)
[![Next.js](https://img.shields.io/badge/Next.js-15-black.svg)](https://nextjs.org/)
[![Fastify](https://img.shields.io/badge/Fastify-5.0-green.svg)](https://fastify.dev/)
[![Prisma](https://img.shields.io/badge/Prisma-5.21-indigo.svg)](https://www.prisma.io/)
[![MCP](https://img.shields.io/badge/MCP-Protocol-purple.svg)](https://modelcontextprotocol.io/)
[![Test Suite](https://img.shields.io/badge/Tests-76%20passing-brightgreen.svg)](#-testing--verification)
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

### 📊 Evaluation & Regression Harness
- **Eval Cases & Suites**: Test definitions (`EvalCase`) specifying input parameters, expected tool calls, and success criteria.
- **Deterministic Scoring Engine**: Automated scoring formula:
  $$\text{Score} = \frac{\text{StatusMatch} + \text{ToolsMatch}}{2}$$
- **Regression Analysis**: Delta tracking (`/api/v1/eval-runs/regression`) calculating pass rate changes, score deltas, newly failing cases, and newly passing cases across agent iterations.

### 🔐 Multi-Tenancy, Auth & RBAC
- **Tenant Isolation**: Server-derived organizational context (`organizationId`). Composite query parameters prevent cross-tenant data leaks.
- **Session Authentication**: HMAC-SHA256 signed stateless session cookies (`agentready_session`) with `scrypt` password hashing.
- **Machine Authentication**: SHA-256 hashed API Keys for Bearer token authorization (`AGENT` role).
- **Role-Based Access Control (RBAC)**: Fine-grained permissions for `OWNER`, `ADMIN`, `MEMBER`, `VIEWER`, and `APPROVER` roles.

### 🔌 External Agent Integration
AgentReady is designed to be called by independently-built AI agents (e.g. LangGraph-based) over its public REST API using Bearer-token machine authentication (see API Keys section). It provides the governed integration surface and observation layer for external agents, rather than bundling pre-packaged agent implementations within this repository.

### 💻 Modern Web Dashboard
- Next.js 15 responsive UI styled with modern dark gradients and Tailwind CSS.
- **Overview KPI Panel**: Metrics for active executions, pass rates, pending approvals, and active flags.
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

| Category | Method | Endpoint Path | Description | Access |
|:---|:---:|:---|:---|:---:|
| **Auth** | `POST` | `/api/v1/auth/register` | Register user + new organization | Public |
| **Auth** | `POST` | `/api/v1/auth/login` | Authenticate & issue HMAC session cookie | Public |
| **Auth** | `POST` | `/api/v1/auth/logout` | Revoke active user session | Session |
| **Auth** | `GET` | `/api/v1/auth/me` | Fetch active session & user details | Session |
| **Executions** | `POST` | `/api/v1/executions` | Trigger new agent execution | Session / API Key |
| **Executions** | `GET` | `/api/v1/executions` | List org executions (with pagination/filters) | Session |
| **Executions** | `GET` | `/api/v1/executions/:id` | Get execution details & trace history | Session |
| **Executions** | `PATCH` | `/api/v1/executions/:id` | Transition execution status | Session / Agent |
| **Tool Traces**| `POST` | `/api/v1/tool-call-traces` | Record per-step tool trace & check policy gates | Session / Agent |
| **Tool Traces**| `GET` | `/api/v1/tool-call-traces` | List tool call traces for an execution | Session |
| **Contracts**  | `POST` | `/api/v1/task-contracts` | Create new agent task contract | Session (Admin) |
| **Contracts**  | `GET` | `/api/v1/task-contracts` | List task contracts | Session |
| **Contracts**  | `GET` | `/api/v1/task-contracts/:id` | Get task contract by ID | Session |
| **Governance** | `GET` | `/api/v1/approval-gates` | List policy approval gates | Session |
| **Governance** | `PUT` | `/api/v1/approval-gates` | Upsert approval gate rule | Owner / Admin |
| **Governance** | `GET` | `/api/v1/feature-flags` | List active feature flags | Session |
| **Governance** | `PUT` | `/api/v1/feature-flags` | Upsert feature flag rule | Owner / Admin |
| **Governance** | `POST` | `/api/v1/feature-flags/toggle` | Toggle feature flag state | Owner / Admin |
| **Governance** | `GET` | `/api/v1/approval-requests` | List pending approval requests | Session |
| **Governance** | `POST` | `/api/v1/approval-requests/:id/review` | Approve or reject pending request | Owner / Admin / Approver |
| **Governance** | `GET` | `/api/v1/mcp-servers` | List registered MCP server gateways | Session |
| **Evals**      | `POST` | `/api/v1/eval-runs` | Create single eval run | Session / Agent |
| **Evals**      | `GET` | `/api/v1/eval-runs` | List evaluation runs | Session |
| **Evals**      | `GET` | `/api/v1/eval-runs/regression` | Fetch evaluation regression comparison | Session |
| **Eval Cases** | `POST` | `/api/v1/eval-cases` | Define new evaluation test case | Session (Admin) |
| **Eval Cases** | `GET` | `/api/v1/eval-cases` | List registered evaluation test cases | Session |
| **Eval Cases** | `POST` | `/api/v1/eval-cases/:id/run` | Execute single evaluation case | Session / Agent |
| **Eval Cases** | `POST` | `/api/v1/eval-suites/run` | Run complete evaluation suite | Session / Agent |
| **Observability**| `GET` | `/api/v1/observability/dashboard` | Fetch aggregated KPI dashboard metrics | Session |
| **Audit Logs** | `GET` | `/api/v1/audit-logs` | Query organization audit trail | Session |
| **API Keys**   | `POST` | `/api/v1/api-keys` | Generate new machine API Key | Owner / Admin |
| **API Keys**   | `GET` | `/api/v1/api-keys` | List organization API Keys | Owner / Admin |
| **API Keys**   | `DELETE` | `/api/v1/api-keys/:id` | Revoke machine API Key | Owner / Admin |

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

- **Node.js**: `v18.0.0` or higher
- **pnpm**: `v9.0.0` or higher (`npm install -g pnpm`)
- **Docker & PostgreSQL**: (Optional for local testing; automated tests run against an in-memory mock engine).

### Installation Steps

1. **Clone the repository and install dependencies**:
   ```bash
   git clone https://github.com/Deadeye102000/Agentready.git
   cd Agentready
   pnpm install
   ```

2. **Configure Environment Variables**:
   ```bash
   cp .env.example .env
   ```

   *Sample `.env` configuration*:
   ```env
   NODE_ENV=development
   DATABASE_URL="postgresql://postgres:postgres@localhost:5432/agentready?schema=public"
   AUTH_SESSION_SECRET="super-secret-development-hmac-key-32-chars-min"
   API_PORT=3001
   API_HOST=0.0.0.0
   API_CORS_ORIGINS="http://localhost:3000"
   NEXT_PUBLIC_AGENTREADY_API_URL="http://localhost:3001"
   ```

3. **Database Initialization (with Docker)**:
   ```bash
   # Start PostgreSQL container
   docker compose up -d postgres

   # Generate Prisma Client
   pnpm db:generate

   # Run DB Migrations & Seed Baseline Data
   pnpm db:migrate
   pnpm db:seed
   ```

4. **Launch Development Servers**:
   ```bash
   pnpm dev
   ```
   - 🌐 **Dashboard**: [http://localhost:3000](http://localhost:3000)
   - ⚡ **API Backend**: [http://localhost:3001](http://localhost:3001)

---

## 🧪 Testing & Verification

AgentReady features a comprehensive test suite built on **Node's native test runner** (`tsx`) — requiring zero heavy third-party testing framework overhead.

```bash
# Run all tests across workspaces (API + Web)
pnpm test

# Run API integration tests only
pnpm test:api

# Run Frontend smoke tests only
pnpm test:web

# Run TypeScript static typecheck
pnpm typecheck

# Verify production build compilation
pnpm build
```

### Test Suite Summary (76 Passing Tests, 0 Failures)

| Test Suite | Tests | Target File | Features Covered |
|:---|:---:|:---|:---|
| **Auth Suite** | 5 | [`apps/api/test/auth.test.ts`](apps/api/test/auth.test.ts) | User registration, login, session validation, cookie issuance |
| **Execution State Machine** | 6 | [`apps/api/test/execution-state-machine.test.ts`](apps/api/test/execution-state-machine.test.ts) | Valid/invalid state transitions, terminal status protection |
| **Tenancy Isolation** | 3 | [`apps/api/test/tenancy.test.ts`](apps/api/test/tenancy.test.ts) | Cross-org boundary checks, 404 existence privacy masks |
| **Feature Flags** | 6 | [`apps/api/test/feature-flags.test.ts`](apps/api/test/feature-flags.test.ts) | Flag overrides, state toggles, audit logs, auto-approval override |
| **Approval Gates** | 9 | [`apps/api/test/approval-gates.test.ts`](apps/api/test/approval-gates.test.ts) | Policy pattern matching, risk thresholds, approval suspension |
| **Eval Framework** | 6 | [`apps/api/test/eval-framework.test.ts`](apps/api/test/eval-framework.test.ts) | Test case definition, scoring formula, suite runs |
| **Eval Regression** | 1 | [`apps/api/test/regression.test.ts`](apps/api/test/regression.test.ts) | Delta calculation, newly failing/passing metric comparisons |
| **Critical E2E Flows** | 11 | [`apps/api/test/critical-flows.test.ts`](apps/api/test/critical-flows.test.ts) | End-to-end flow: Register $\to$ Contract $\to$ Execution $\to$ Trace $\to$ Approval $\to$ Eval |
| **Frontend Smoke** | 19 | [`apps/web/test/smoke.test.ts`](apps/web/test/smoke.test.ts) | Data contract validation, state enums, fallback math |
| **Background Worker** | 3 | [`apps/api/test/worker.test.ts`](apps/api/test/worker.test.ts) | Atomic DB claim polling, concurrency isolation, system logging |
| **RBAC Protection** | 4 | [`apps/api/test/rbac.test.ts`](apps/api/test/rbac.test.ts) | Endpoint role gating (`OWNER`, `ADMIN`, `MEMBER`, `VIEWER`, `APPROVER`) |
| **API Keys & Machine Auth** | 3 | [`apps/api/test/api-keys.test.ts`](apps/api/test/api-keys.test.ts) | Key generation, Bearer header token resolution, hash storage |

---

## 🗺️ Roadmap & Future Expansion Plans

- [x] **Core Monorepo Scaffold & Multi-Tenancy Architecture**
- [x] **Stateless HMAC Sessions & Password Hashing (`scrypt`)**
- [x] **Agent Execution Lifecycle Engine & State Machine**
- [x] **Policy Governance: Approval Gates & Hierarchical Feature Flags**
- [x] **Awaited Synchronous Audit Logging**
- [x] **Deterministic Evaluation & Regression Delta Suite**
- [x] **Model Context Protocol (MCP) Server Integration**
- [x] **Next.js 15 Dashboard with Interactive Sandbox Controller**
- [x] **Role-Based Access Control (RBAC) & Bearer Machine API Keys**
- [x] **Async Background Execution Worker**
- [ ] **Dedicated Audit Log UI Page**: Filterable table view for security & compliance officers (`/audit-logs`).
- [ ] **Typed API Response Contracts**: Shared response types across frontend & backend via `@agentready/shared`.
- [ ] **Real-time Webhook Notifications**: Push alerts for pending `ApprovalRequest` events to Slack, Teams, or custom webhooks.
- [ ] **HTTP / SSE Transport for MCP Gateway**: Extend MCP server from stdio transport to distributed HTTP/SSE endpoints.
- [ ] **Password Reset & Team Invite Workflows**: Email token-based credential recovery and team onboarding flows.
- [ ] **Custom LLM Judge Scoring**: Integrate non-deterministic LLM-as-a-judge scoring for complex agent evaluation criteria.

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
