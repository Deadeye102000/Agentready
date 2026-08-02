/**
 * Critical Flows Integration Tests
 *
 * Exercises the end-to-end critical user/agent paths through the API:
 *   1. Register/login user
 *   2. Create and list task contract within organization
 *   3. Start agent execution
 *   4. Tool call trace is created
 *   5. Risky action creates an approval request
 *   6. Approve/reject approval request
 *   7. Feature flag blocks a disabled capability
 *   8. Eval case runs and creates a result
 *
 * Uses the in-memory mockPrisma — no real DB required.
 */
import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { buildServer } from "../src/server.js";
import { mockStore, resetMockStore } from "./mockPrisma.js";
import { signSession } from "@agentready/auth";
import { env } from "../src/lib/env.js";

// ─── Seed helper ──────────────────────────────────────────────────────────────

function seedBaseFixtures() {
  const org = {
    id: "org-cf",
    name: "Critical Flows Org",
    slug: "critical-flows",
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  const user = {
    id: "user-cf",
    email: "cf@example.com",
    name: "CF User",
    passwordHash: "hash",
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  const agent = {
    id: "agent-cf",
    organizationId: "org-cf",
    name: "CF Agent",
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  const project = {
    id: "proj-cf",
    organizationId: "org-cf",
    name: "CF Project",
    status: "ACTIVE",
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  mockStore.organizations.push(org);
  mockStore.users.push(user);
  mockStore.memberships.push({
    id: "mem-cf",
    userId: "user-cf",
    organizationId: "org-cf",
    role: "OWNER",
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  mockStore.agentIdentities.push(agent);
  mockStore.projects.push(project);
}

describe("Critical Flows Integration Tests", () => {
  let app: any;
  let cookie: string;

  beforeEach(async () => {
    resetMockStore();
    app = await buildServer();
    seedBaseFixtures();

    const token = signSession(
      { userId: "user-cf", organizationId: "org-cf", exp: Math.floor(Date.now() / 1000) + 3600 },
      env.AUTH_SESSION_SECRET
    );
    cookie = `agentready_session=${token}`;
  });

  // ─── Flow 1: Register then login ────────────────────────────────────────────

  it("Flow 1a: POST /auth/register creates user, org, membership, and returns session cookie", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/auth/register",
      payload: {
        email: "newuser@example.com",
        password: "Password1234!",
        name: "New User",
        organizationName: "New Org",
      },
    });

    assert.equal(res.statusCode, 201);
    const body = JSON.parse(res.body);
    assert.ok(body.user?.email === "newuser@example.com");
    assert.ok(body.organization?.name === "New Org");
    assert.equal(body.role, "OWNER");

    const cookieHeader = res.headers["set-cookie"];
    const cookieStr = Array.isArray(cookieHeader) ? cookieHeader[0] : cookieHeader;
    assert.ok(cookieStr?.includes("agentready_session="));
  });

  it("Flow 1b: POST /auth/login returns session for existing user", async () => {
    // Register first, then login fresh
    await app.inject({
      method: "POST",
      url: "/api/v1/auth/register",
      payload: {
        email: "loginflow@example.com",
        password: "Password1234!",
        name: "Login Flow",
        organizationName: "Login Org",
      },
    });

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: { email: "loginflow@example.com", password: "Password1234!" },
    });

    assert.equal(res.statusCode, 200);
    const body = JSON.parse(res.body);
    assert.equal(body.user.email, "loginflow@example.com");
  });

  // ─── Flow 2: Create and list task contract ────────────────────────────────

  it("Flow 2: POST /task-contracts creates and GET /task-contracts lists contracts scoped to org", async () => {
    // Create
    const createRes = await app.inject({
      method: "POST",
      url: "/api/v1/task-contracts",
      headers: { cookie },
      payload: {
        projectId: "proj-cf",
        agentId: "agent-cf",
        name: "Deploy Safety Contract",
        objective: "Safely deploy artifact to staging",
        allowedTools: ["deploy.staging"],
        successCriteria: ["status_code == 200"],
      },
    });

    assert.equal(createRes.statusCode, 201);
    const created = JSON.parse(createRes.body);
    assert.equal(created.name, "Deploy Safety Contract");
    assert.equal(created.organizationId, "org-cf");
    assert.ok(created.id);

    // List
    const listRes = await app.inject({
      method: "GET",
      url: "/api/v1/task-contracts",
      headers: { cookie },
    });

    assert.equal(listRes.statusCode, 200);
    const list = JSON.parse(listRes.body);
    assert.ok(Array.isArray(list));
    assert.ok(list.some((c: any) => c.id === created.id));
  });

  it("Flow 2b: GET /task-contracts for another org returns empty list (isolation)", async () => {
    // Seed cross-org contract
    mockStore.taskContracts.push({
      id: "contract-other-org",
      organizationId: "other-org",
      name: "Other Org Contract",
      version: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const res = await app.inject({
      method: "GET",
      url: "/api/v1/task-contracts",
      headers: { cookie }, // authenticated as org-cf
    });

    assert.equal(res.statusCode, 200);
    const list = JSON.parse(res.body);
    // org-cf has no contracts, only other-org does
    const leaked = list.some((c: any) => c.id === "contract-other-org");
    assert.equal(leaked, false, "Cross-org contract must not appear in org-cf listing");
  });

  // ─── Flow 3: Start agent execution ───────────────────────────────────────

  it("Flow 3: POST /executions creates a QUEUED execution with organizationId scoped from session", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/executions",
      headers: { cookie },
      payload: {
        projectId: "proj-cf",
        agentId: "agent-cf",
        objective: "Generate monthly usage report",
        input: { month: "2026-07" },
        riskScore: 15,
      },
    });

    assert.equal(res.statusCode, 201);
    const exec = JSON.parse(res.body);
    assert.equal(exec.status, "QUEUED");
    assert.equal(exec.organizationId, "org-cf");
    assert.equal(exec.projectId, "proj-cf");
    assert.equal(exec.agentId, "agent-cf");
    assert.ok(exec.id);
  });

  // ─── Flow 4: Tool call trace is created ──────────────────────────────────

  it("Flow 4: POST /tool-call-traces records trace linked to execution", async () => {
    // Seed execution
    const exec = {
      id: "exec-trace-test",
      organizationId: "org-cf",
      projectId: "proj-cf",
      agentId: "agent-cf",
      status: "RUNNING",
      objective: "Test trace creation",
      input: {},
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    mockStore.agentExecutions.push(exec);

    // Enable the tool's feature flag
    mockStore.featureFlags.push({
      id: "flag-tool-cf",
      organizationId: "org-cf",
      agentId: "agent-cf",
      capability: "knowledge.search",
      state: "ENABLED",
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tool-call-traces",
      headers: { cookie },
      payload: {
        executionId: "exec-trace-test",
        agentId: "agent-cf",
        toolName: "knowledge.search",
        status: "SUCCEEDED",
        input: { query: "deployment best practices" },
        output: { results: ["result-1", "result-2"] },
        latencyMs: 98,
      },
    });

    assert.equal(res.statusCode, 201);
    const trace = JSON.parse(res.body);
    assert.equal(trace.toolName, "knowledge.search");
    assert.equal(trace.status, "SUCCEEDED");
    assert.equal(trace.executionId, "exec-trace-test");

    // Verify stored in mock DB
    assert.equal(mockStore.toolCallTraces.length, 1);
    assert.equal(mockStore.toolCallTraces[0].toolName, "knowledge.search");
  });

  // ─── Flow 5: Risky action creates approval request ───────────────────────

  it("Flow 5: Posting a tool call trace on a REQUIRE_APPROVAL gate creates an ApprovalRequest and blocks the execution", async () => {
    // Seed execution with riskScore so gate trigger fires
    const exec = {
      id: "exec-approval-test",
      organizationId: "org-cf",
      projectId: "proj-cf",
      agentId: "agent-cf",
      status: "RUNNING",
      objective: "Publish documentation externally",
      input: {},
      riskScore: 50,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    mockStore.agentExecutions.push(exec);

    // Enable the feature flag but require approval for it
    mockStore.featureFlags.push({
      id: "flag-ext-publish",
      organizationId: "org-cf",
      agentId: "agent-cf",
      capability: "external.publish",
      state: "ENABLED",
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    mockStore.approvalGates.push({
      id: "gate-ext-publish",
      organizationId: "org-cf",
      capability: "external.publish",
      mode: "REQUIRE_APPROVAL",
      reason: "Customer-facing publish requires human sign-off",
      riskLevel: 0,   // trigger on any risk score
      enabled: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tool-call-traces",
      headers: { cookie },
      payload: {
        executionId: "exec-approval-test",
        agentId: "agent-cf",
        toolName: "external.publish",
        status: "PENDING",
        input: { path: "/docs/welcome", content: "# Welcome" },
        latencyMs: 5,
      },
    });

    assert.equal(res.statusCode, 201);
    const trace = JSON.parse(res.body);

    // Trace must be BLOCKED
    assert.equal(trace.status, "BLOCKED");
    assert.ok(trace.error?.includes("approval_requested") || trace.error?.includes("approval"));

    // Approval request must have been created
    assert.equal(mockStore.approvalRequests.length, 1);
    assert.equal(mockStore.approvalRequests[0].status, "PENDING");
    assert.equal(mockStore.approvalRequests[0].requestedAction, "external.publish");

    // Execution must be WAITING_FOR_APPROVAL
    const stored = mockStore.agentExecutions.find((e) => e.id === "exec-approval-test");
    assert.equal(stored?.status, "WAITING_FOR_APPROVAL");
  });

  // ─── Flow 6: Approve / reject approval request ───────────────────────────

  it("Flow 6a: Approving a pending request marks execution as RUNNING", async () => {
    // Seed execution in WAITING_FOR_APPROVAL
    mockStore.agentExecutions.push({
      id: "exec-to-approve",
      organizationId: "org-cf",
      projectId: "proj-cf",
      agentId: "agent-cf",
      status: "WAITING_FOR_APPROVAL",
      objective: "Approve test",
      input: {},
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    // Seed approval request
    mockStore.approvalRequests.push({
      id: "req-approve-cf",
      organizationId: "org-cf",
      agentId: "agent-cf",
      requestedAction: "external.publish",
      reason: "Requires sign-off",
      payload: { executionId: "exec-to-approve" },
      status: "PENDING",
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/approval-requests/req-approve-cf/review",
      headers: { cookie },
      payload: { status: "APPROVED", note: "Reviewed and approved for production." },
    });

    assert.equal(res.statusCode, 200);
    const approval = JSON.parse(res.body);
    assert.equal(approval.status, "APPROVED");

    // Execution should be back to RUNNING
    const exec = mockStore.agentExecutions.find((e) => e.id === "exec-to-approve");
    assert.equal(exec?.status, "RUNNING");

    // Audit log should exist
    assert.ok(mockStore.auditLogs.some((a: any) => a.action?.includes("approval_request")));
  });

  it("Flow 6b: Rejecting a pending request marks execution as FAILED (terminal)", async () => {
    // Seed execution
    mockStore.agentExecutions.push({
      id: "exec-to-reject",
      organizationId: "org-cf",
      projectId: "proj-cf",
      agentId: "agent-cf",
      status: "WAITING_FOR_APPROVAL",
      objective: "Reject test",
      input: {},
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    // Seed approval request
    mockStore.approvalRequests.push({
      id: "req-reject-cf",
      organizationId: "org-cf",
      agentId: "agent-cf",
      requestedAction: "database.drop",
      reason: "Destructive operation requires verification",
      payload: { executionId: "exec-to-reject" },
      status: "PENDING",
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/approval-requests/req-reject-cf/review",
      headers: { cookie },
      payload: { status: "REJECTED", note: "Not approved - missing DBA sign-off ticket." },
    });

    assert.equal(res.statusCode, 200);
    const approval = JSON.parse(res.body);
    assert.equal(approval.status, "REJECTED");

    // Execution should be FAILED (terminal)
    const exec = mockStore.agentExecutions.find((e) => e.id === "exec-to-reject");
    assert.equal(exec?.status, "FAILED");
  });

  // ─── Flow 7: Feature flag blocks disabled capability ─────────────────────

  it("Flow 7: Disabled agent_execution feature flag blocks new execution creation with 403", async () => {
    // Disable execution capability org-wide
    mockStore.featureFlags.push({
      id: "flag-disable-exec",
      organizationId: "org-cf",
      agentId: null,
      capability: "agent_execution",
      state: "DISABLED",
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/executions",
      headers: { cookie },
      payload: {
        projectId: "proj-cf",
        agentId: "agent-cf",
        objective: "Should be blocked",
        input: {},
      },
    });

    assert.equal(res.statusCode, 403);
    const body = JSON.parse(res.body);
    assert.equal(body.error.code, "FORBIDDEN");
  });

  // ─── Flow 8: Eval case runs and creates result ───────────────────────────

  it("Flow 8: POST /eval-runs creates an eval run with pass/fail result and links to execution", async () => {
    // Seed execution
    mockStore.agentExecutions.push({
      id: "exec-eval-test",
      organizationId: "org-cf",
      projectId: "proj-cf",
      agentId: "agent-cf",
      status: "SUCCEEDED",
      objective: "Eval test",
      input: {},
      output: { result: "ok" },
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    // Enable eval_runner feature
    mockStore.featureFlags.push({
      id: "flag-eval",
      organizationId: "org-cf",
      agentId: null,
      capability: "eval_runner",
      state: "ENABLED",
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const evalCase = {
      id: "evalcase-cf",
      organizationId: "org-cf",
      name: "Safety compliance eval",
      taskContractId: null,
      input: { query: "test" },
      expectedStatus: "SUCCEEDED",
      expectedToolCalls: [],
      successCriteria: "status_match",
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    mockStore.evalCases.push(evalCase);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/eval-runs",
      headers: { cookie },
      payload: {
        projectId: "proj-cf",
        name: "Safety compliance eval",
        executionId: "exec-eval-test",
        threshold: 0.8,
        score: 1.0,
        status: "PASSED",
      },
    });

    assert.equal(res.statusCode, 201);
    const evalRun = JSON.parse(res.body);
    assert.equal(evalRun.organizationId, "org-cf");
    assert.equal(evalRun.executionId, "exec-eval-test");
    assert.ok(["PASSED", "FAILED"].includes(evalRun.status));
    assert.ok(typeof evalRun.score === "number");
  });
});
