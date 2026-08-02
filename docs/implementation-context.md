# AgentReady Implementation Context & Handoff Guide

This document provides a comprehensive technical overview of the current state of AgentReady. It is designed to give developers, thinking partners, and AI assistants immediate context on the system's architecture, data models, completed implementations, and next development steps.

---

## 1. Project Overview & Architecture

AgentReady is an **agent-first B2B SaaS platform** built to make software usage by autonomous AI agents safe, observable, testable, and auditable. Rather than allowing agents raw, uncontrolled access to APIs, AgentReady acts as a governed middleware and observation layer.

The codebase is structured as a **TypeScript monorepo** managed with `pnpm` workspaces:

```mermaid
graph TD
    apps/web[apps/web<br>Next.js Dashboard] --> packages/shared
    apps/api[apps/api<br>Fastify Backend] --> packages/shared
    apps/api --> packages/db
    apps/api --> packages/auth
    apps/api --> packages/agent-contracts
    apps/mcp-server[apps/mcp-server<br>MCP Server Scaffold]
    
    packages/db --> Prisma[Prisma ORM & Schema]
    packages/auth --> Crypto[scrypt & HMAC Session]
    packages/agent-contracts --> Contracts[Zod Contracts & Schemas]
```

### Module Layout
*   `apps/web`: Next.js web application rendering the user dashboard.
*   `apps/api`: Fastify backend containing modules for tenant management, authentication, executions, governance, observability, and auditing.
*   `apps/mcp-server`: A shell for future Model Context Protocol (MCP) server integration.
*   `packages/db`: Central database package containing the Prisma schema, client generator, and helper utilities.
*   `packages/shared`: Shared types, Zod schemas, and utility functions used across frontend and backend.
*   `packages/auth`: Low-level password hashing and session signature/verification routines.
*   `packages/agent-contracts`: Data structures and schemas defining task contracts for agents.

---

## 2. Core Implemented Features

### A. Authentication & Session Management
*   **Password Security**: Implemented secure password registration and verification using Node's native `scrypt` hashing algorithm inside [packages/auth/src/index.ts](file:///Users/Deadeye/Desktop/Projects/Agentready/packages/auth/src/index.ts).
*   **Stateless Cookie Sessions**: Sessions are stateless, signed using HMAC-SHA256 with a 32-character minimum secret (`AUTH_SESSION_SECRET`), and stored in HTTP-only, `SameSite=Lax` cookies (`agentready_session`).
*   **Auth Module**: Fastify plugins, routes, services, and repositories handle registration, login, logout, and retrieving current user context (`/api/v1/auth/me`).

### B. Strict Multi-Tenancy Enforcement
*   **Server-Derived Context**: Protected routes require organization membership and derive the tenant ID directly from the validated session (`request.authContext.organizationId`). Request bodies and queries omit `organizationId` schemas to prevent client-side tenant injection.
*   **Relational Tenancy Isolation**: Before writing related records, services perform tenancy verification at the repository layer. For example, when initiating an execution, the system checks that the associated `project`, `task`, `contract`, and `agent` all belong to the current user's organization.

### C. Standardized Error Handling
*   **Global Exception Filter**: Standardized all errors into a unified JSON structure using a central Fastify error handler:
    ```json
    {
      "error": {
        "code": "ERROR_CODE",
        "message": "User-friendly message explaining the error.",
        "details": {
          "requestId": "unique-request-id"
        }
      }
    }
    ```
*   **Custom Adapters**: Mapped Zod validation failures, database constraint violations (Prisma codes `P2002`, `P2025`, `P2003`), HTTP exception helpers, rate-limit triggers, and CORS rejections to clean user-facing representations.

### D. Agent Execution State Machine
*   **Lifecycle Management**: centralizes state transitions to enforce the lifecycle of agent runs:
    ```
    [QUEUED] ──> [RUNNING] ──> [WAITING_FOR_APPROVAL] ──> [SUCCEEDED] / [FAILED] / [CANCELLED]
    ```
*   **Transition Rules**: centralizes state validation in `apps/api/src/modules/agent-executions/executionStateMachine.ts` before allowing updates in the database.

### E. Governance: Feature Flags & Approval Gates
*   **Capability Enablement (Feature Flags)**: Determines whether a specific agent identity is allowed to invoke a particular capability (e.g. `file_write`, `send_email`).
*   **Policy Enforcement (Approval Gates)**: Defines execution policy modes:
    *   `AUTOMATIC`: Allow action without human intervention.
    *   `REQUIRE_APPROVAL`: Suspend execution and create an `ApprovalRequest` record for human review.
    *   `BLOCKED`: Prevent execution entirely.

### F. Awaited Audit Logging
*   **Security Auditing**: Implements synchronous, awaited database logging for sensitive operations (e.g., authentication, execution creations, gate configuration updates).
*   **Auditing Strategy**: Audit writes are intentionally awaited during core execution flows. If the audit database log fails to insert, the parent action rolls back or fails, preventing silent, unaudited operations.
*   **Actor Classification**: Traces origin actors classified under `USER`, `AGENT`, or `SYSTEM`.

### G. Observability Dashboard
*   **Aggregated Endpoint**: `/api/v1/observability/dashboard` computes metrics such as execution status counts, pending approval queues, blocked capabilities, and evaluation pass rates.
*   **Frontend Dashboard UI**: Built a rich, interactive Next.js dashboard view at `apps/web/src/app/page.tsx` displaying real-time metrics, execution lists, and active governance configuration.

---

## 3. Database Schema Design (Prisma)

The schema defines a rich relational layout mapping enterprise tenancy to agent operations:

| Model | Purpose | Key Attributes / Relations |
| :--- | :--- | :--- |
| **Organization** | The primary tenant entity | Root owner of users, members, agents, projects, and execution traces. |
| **User** / **Member** | Humans with system access | Scoped to organizations via `OrganizationMember` with roles (Owner, Admin, Member, Viewer). |
| **AgentIdentity** | Registered AI agents | Represents autonomous actors executing tasks. Scoped to Organization. |
| **Project** / **Task** | Workspace context | Grouping mechanisms for execution objectives. |
| **TaskContract** | Executable rules for agents | Declares required inputs, success criteria, allowed tools, and required evaluations. |
| **AgentExecution** | Individual execution instance | Tracks agent status (`QUEUED`, `RUNNING`, etc.), objectives, outputs, and risk scores. |
| **ToolCallTrace** | Execution step level trace | Stores inputs, outputs, errors, latency, and reference to approvals for a specific tool call. |
| **ApprovalRequest** | Suspended capability review | Holds action payloads, status (`PENDING`, `APPROVED`, etc.), and reviewer details. |
| **AuditLog** | Immutable activity history | Records `actorType` (`USER`, `AGENT`, `SYSTEM`), action description, and meta payloads. |
| **AgentFeatureFlag** / **ApprovalGate** | Security settings | Controls allowed capability states and review workflows. |

---

## 4. Local Setup Status & Development Gotchas

> [!WARNING]
> Review these environmental constraints before starting development.

1.  **Docker/PostgreSQL Availability**:
    *   Docker is currently **not** available in the local execution sandbox environment.
    *   As a result, actual database migrations (`prisma migrate dev`) and database seeding (`prisma db:seed`) cannot be executed against a live database instance.
    *   **Workaround**: Prisma commands that do not require an active database connection—such as `prisma validate` and `prisma generate`—are fully functional using an inline mock connection string:
        ```bash
        DATABASE_URL='postgresql://agentready:agentready@localhost:5432/agentready?schema=public' pnpm db:generate
        ```
2.  **API Port Configuration**:
    *   The Fastify backend listens on port `3001` (configured via `.env` or defaults).
    *   The Next.js frontend calls the API via the `AGENTREADY_API_URL` environment variable. Ensure this matches:
        ```bash
        AGENTREADY_API_URL=http://localhost:3001
        ```
    *   *Note*: The frontend includes fallback hardcoded demo data when the API is unauthenticated or unreachable. Ensure the dev server is fully authenticated to verify live API connections.

---

## 5. Next Steps & Development Roadmap

For the next implementation phase, consider addressing these high-priority items:

*   [ ] **Create Automated Test Suite**:
    *   Write integration tests for `apps/api` validating register, login, and `/me` routes.
    *   Implement tenancy tests verifying that requests with spoofed or unauthorized IDs (e.g. creating executions in another tenant's project) return `403` or `404`.
    *   Add test coverage for state machine transitions.
*   [ ] **Build Authentication Frontend Screens**:
    *   Implement `/register`, `/login`, and user-session recovery UI pages in the Next.js frontend.
    *   Link the Next.js fetch layer to handle auth session cookies.
*   [ ] **Role-Based Access Controls (RBAC)**:
    *   Validate user membership roles (`OWNER`, `ADMIN`, `MEMBER`, `VIEWER`) on sensitive administrative endpoints.
*   [ ] **Execution Background Runner**:
    *   Create a simple queue polling service or background worker pattern to transition `QUEUED` executions to `RUNNING` in an isolated harness environment.
