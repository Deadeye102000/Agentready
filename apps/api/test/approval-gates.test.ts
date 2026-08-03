import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { buildServer } from "../src/server.js";
import { mockStore, resetMockStore } from "./mockPrisma.js";
import { signSession } from "@agentready/auth";
import { env } from "../src/lib/env.js";

describe("Approval Gates Integration Tests", () => {
  let app: any;
  let cookieA: string;

  beforeEach(async () => {
    resetMockStore();
    app = await buildServer();

    // Seed org, user, membership, project, agent, feature flag (enabled globally)
    const org = { id: "org-1", name: "Test Org", slug: "test-org", createdAt: new Date(), updatedAt: new Date() };
    mockStore.organizations.push(org);

    const user = { id: "user-1", email: "user@example.com", name: "User 1", passwordHash: "hash", createdAt: new Date(), updatedAt: new Date() };
    mockStore.users.push(user);

    mockStore.memberships.push({
      id: "mem-1",
      userId: "user-1",
      organizationId: "org-1",
      role: "OWNER",
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const agent = { id: "agent-1", organizationId: "org-1", name: "Test Agent", createdAt: new Date(), updatedAt: new Date() };
    mockStore.agentIdentities.push(agent);

    const project = { id: "proj-1", organizationId: "org-1", name: "Proj 1", status: "ACTIVE", createdAt: new Date(), updatedAt: new Date() };
    mockStore.projects.push(project);

    // Seed feature flags to allow tool calls by default
    mockStore.featureFlags.push(
      { id: "flag-1", organizationId: "org-1", agentId: "agent-1", capability: "file_write", state: "ENABLED", createdAt: new Date(), updatedAt: new Date() },
      { id: "flag-2", organizationId: "org-1", agentId: "agent-1", capability: "file_read", state: "ENABLED", createdAt: new Date(), updatedAt: new Date() },
      { id: "flag-3", organizationId: "org-1", agentId: "agent-1", capability: "network_fetch", state: "ENABLED", createdAt: new Date(), updatedAt: new Date() },
      { id: "flag-4", organizationId: "org-1", agentId: "agent-1", capability: "db_write", state: "ENABLED", createdAt: new Date(), updatedAt: new Date() },
      { id: "flag-5", organizationId: "org-1", agentId: "agent-1", capability: "email_send", state: "ENABLED", createdAt: new Date(), updatedAt: new Date() }
    );

    const token = signSession(
      { userId: "user-1", organizationId: "org-1", exp: Math.floor(Date.now() / 1000) + 3600 },
      env.AUTH_SESSION_SECRET
    );
    cookieA = `agentready_session=${token}`;
  });

  it("Gate Pattern Matching - file_* blocks file_write and file_read but allows network_fetch", async () => {
    // Seed wildcard gate blocking file_*
    mockStore.approvalGates.push({
      id: "gate-1",
      organizationId: "org-1",
      capability: "file_*",
      mode: "BLOCKED",
      reason: "Wildcard block",
      riskLevel: 0,
      enabled: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const exec = {
      id: "exec-1",
      organizationId: "org-1",
      projectId: "proj-1",
      agentId: "agent-1",
      status: "RUNNING",
      objective: "Test objective",
      input: {},
      riskScore: 10,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    mockStore.agentExecutions.push(exec);

    // Call file_write -> expect BLOCKED
    let res = await app.inject({
      method: "POST",
      url: "/api/v1/tool-call-traces",
      headers: { cookie: cookieA },
      payload: {
        executionId: "exec-1",
        agentId: "agent-1",
        toolName: "file_write",
        status: "RUNNING",
        input: { path: "test.txt" },
      },
    });
    assert.equal(res.statusCode, 201);
    let trace = JSON.parse(res.body);
    assert.equal(trace.status, "BLOCKED");
    assert.match(trace.error, /Wildcard block/);

    // Call network_fetch -> expect allowed (returns input status, PENDING/RUNNING)
    res = await app.inject({
      method: "POST",
      url: "/api/v1/tool-call-traces",
      headers: { cookie: cookieA },
      payload: {
        executionId: "exec-1",
        agentId: "agent-1",
        toolName: "network_fetch",
        status: "RUNNING",
        input: { url: "http://example.com" },
      },
    });
    assert.equal(res.statusCode, 201);
    trace = JSON.parse(res.body);
    assert.equal(trace.status, "RUNNING");
  });

  it("Risk Level Scoping - db_write checks execution risk score", async () => {
    // Seed REQUIRE_APPROVAL gate with riskLevel 50
    mockStore.approvalGates.push({
      id: "gate-2",
      organizationId: "org-1",
      capability: "db_write",
      mode: "REQUIRE_APPROVAL",
      reason: "High risk write require human review",
      riskLevel: 50,
      enabled: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    // 1. Execution with riskScore 30 (bypasses gate because 30 < 50)
    const execLow = {
      id: "exec-low",
      organizationId: "org-1",
      projectId: "proj-1",
      agentId: "agent-1",
      status: "RUNNING",
      objective: "Low risk objective",
      input: {},
      riskScore: 30,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    mockStore.agentExecutions.push(execLow);

    let res = await app.inject({
      method: "POST",
      url: "/api/v1/tool-call-traces",
      headers: { cookie: cookieA },
      payload: {
        executionId: "exec-low",
        agentId: "agent-1",
        toolName: "db_write",
        status: "RUNNING",
        input: {},
      },
    });
    assert.equal(res.statusCode, 201);
    let trace = JSON.parse(res.body);
    assert.equal(trace.status, "RUNNING"); // allowed!

    // 2. Execution with riskScore 80 (triggers gate because 80 >= 50)
    const execHigh = {
      id: "exec-high",
      organizationId: "org-1",
      projectId: "proj-1",
      agentId: "agent-1",
      status: "RUNNING",
      objective: "High risk objective",
      input: {},
      riskScore: 80,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    mockStore.agentExecutions.push(execHigh);

    res = await app.inject({
      method: "POST",
      url: "/api/v1/tool-call-traces",
      headers: { cookie: cookieA },
      payload: {
        executionId: "exec-high",
        agentId: "agent-1",
        toolName: "db_write",
        status: "RUNNING",
        input: {},
      },
    });
    assert.equal(res.statusCode, 201);
    trace = JSON.parse(res.body);
    assert.equal(trace.status, "BLOCKED");
    assert.equal(trace.error, "approval_requested"); // records approval_requested in trace event
    assert.ok(trace.approvalRequestId);

    // Verify execution paused and transitioned to WAITING_FOR_APPROVAL
    const executionState = mockStore.agentExecutions.find((e) => e.id === "exec-high");
    assert.equal(executionState.status, "WAITING_FOR_APPROVAL");
    
    // Verify approval request created
    assert.equal(mockStore.approvalRequests.length, 1);
    assert.equal(mockStore.approvalRequests[0].status, "PENDING");
  });

  it("Disabled Gates - email_send gate is ignored when enabled is false", async () => {
    // Seed disabled gate
    mockStore.approvalGates.push({
      id: "gate-3",
      organizationId: "org-1",
      capability: "email_send",
      mode: "BLOCKED",
      reason: "Blocked by default but gate is disabled",
      riskLevel: 0,
      enabled: false, // disabled
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const exec = {
      id: "exec-3",
      organizationId: "org-1",
      projectId: "proj-1",
      agentId: "agent-1",
      status: "RUNNING",
      objective: "Test objective",
      input: {},
      riskScore: 10,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    mockStore.agentExecutions.push(exec);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tool-call-traces",
      headers: { cookie: cookieA },
      payload: {
        executionId: "exec-3",
        agentId: "agent-1",
        toolName: "email_send",
        status: "RUNNING",
        input: {},
      },
    });
    assert.equal(res.statusCode, 201);
    const trace = JSON.parse(res.body);
    assert.equal(trace.status, "RUNNING"); // allowed!
  });

  it("Review Approval Request - approve marks execution status as RUNNING", async () => {
    const exec = {
      id: "exec-approve-test",
      organizationId: "org-1",
      projectId: "proj-1",
      agentId: "agent-1",
      status: "WAITING_FOR_APPROVAL",
      objective: "Objective",
      input: {},
      riskScore: 90,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    mockStore.agentExecutions.push(exec);

    const request = {
      id: "req-approve-test",
      organizationId: "org-1",
      agentId: "agent-1",
      requestedAction: "db_write",
      reason: "reason",
      payload: { executionId: "exec-approve-test" },
      status: "PENDING",
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    mockStore.approvalRequests.push(request);

    const res = await app.inject({
      method: "POST",
      url: `/api/v1/approval-requests/req-approve-test/review`,
      headers: { cookie: cookieA },
      payload: {
        status: "APPROVED",
        note: "Looks safe, go ahead",
      },
    });

    assert.equal(res.statusCode, 200);
    const body = JSON.parse(res.body);
    assert.equal(body.status, "APPROVED");

    // Execution should be marked ready to continue (RUNNING)
    const updatedExec = mockStore.agentExecutions.find((e) => e.id === "exec-approve-test");
    assert.equal(updatedExec.status, "RUNNING");

    // Review is audited
    const reviewAudit = mockStore.auditLogs.find((l) => l.action === "approval_request.reviewed");
    assert.ok(reviewAudit);
    assert.equal(reviewAudit.actorUserId, "user-1");
  });

  it("Review Approval Request - reject marks execution status as FAILED", async () => {
    const exec = {
      id: "exec-reject-test",
      organizationId: "org-1",
      projectId: "proj-1",
      agentId: "agent-1",
      status: "WAITING_FOR_APPROVAL",
      objective: "Objective",
      input: {},
      riskScore: 90,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    mockStore.agentExecutions.push(exec);

    const request = {
      id: "req-reject-test",
      organizationId: "org-1",
      agentId: "agent-1",
      requestedAction: "db_write",
      reason: "reason",
      payload: { executionId: "exec-reject-test" },
      status: "PENDING",
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    mockStore.approvalRequests.push(request);

    const res = await app.inject({
      method: "POST",
      url: `/api/v1/approval-requests/req-reject-test/review`,
      headers: { cookie: cookieA },
      payload: {
        status: "REJECTED",
        note: "Risky, block it",
      },
    });

    assert.equal(res.statusCode, 200);
    const body = JSON.parse(res.body);
    assert.equal(body.status, "REJECTED");

    // Execution should be rejected and terminal (FAILED)
    const updatedExec = mockStore.agentExecutions.find((e) => e.id === "exec-reject-test");
    assert.equal(updatedExec.status, "FAILED");
    assert.deepEqual(updatedExec.output, { error: "Execution rejected by user." });

    // Review is audited
    const reviewAudit = mockStore.auditLogs.find((l) => l.action === "approval_request.reviewed");
    assert.ok(reviewAudit);
  });

  it("Execution Start Gating - allowedTools containing REQUIRE_APPROVAL gate creates WAITING_FOR_APPROVAL status and approval request", async () => {
    // Seed REQUIRE_APPROVAL gate for db_write with risk level 50
    mockStore.approvalGates.push({
      id: "gate-db",
      organizationId: "org-1",
      capability: "db_write",
      mode: "REQUIRE_APPROVAL",
      reason: "DB write requires review",
      riskLevel: 50,
      enabled: true,
      createdAt: new Date(),
      updatedAt: new Date()
    });

    // Seed task contract allowing db_write
    mockStore.taskContracts.push({
      id: "contract-db-risky",
      organizationId: "org-1",
      projectId: "proj-1",
      name: "Risky DB Contract",
      version: 1,
      objective: "Update DB records",
      allowedTools: ["db_write"],
      createdAt: new Date(),
      updatedAt: new Date()
    });

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/executions",
      headers: { cookie: cookieA },
      payload: {
        projectId: "proj-1",
        agentId: "agent-1",
        contractId: "contract-db-risky",
        objective: "Perform risky DB updates",
        riskScore: 80 // triggers gate (80 >= 50)
      }
    });

    assert.equal(res.statusCode, 201);
    const exec = JSON.parse(res.body);
    assert.equal(exec.status, "WAITING_FOR_APPROVAL");

    // Verify approval request created
    const pendingReq = mockStore.approvalRequests.find((r) => r.payload.executionId === exec.id);
    assert.ok(pendingReq);
    assert.equal(pendingReq.status, "PENDING");
    assert.equal(pendingReq.requestedAction, "execution.start:db_write");
  });

  it("Execution Start Gating - allowedTools containing BLOCKED gate fails creation with 403 Forbidden", async () => {
    // Seed BLOCKED gate for file_write
    mockStore.approvalGates.push({
      id: "gate-file-blocked",
      organizationId: "org-1",
      capability: "file_write",
      mode: "BLOCKED",
      reason: "File write is completely blocked",
      riskLevel: 0,
      enabled: true,
      createdAt: new Date(),
      updatedAt: new Date()
    });

    // Seed task contract allowing file_write
    mockStore.taskContracts.push({
      id: "contract-file-blocked",
      organizationId: "org-1",
      projectId: "proj-1",
      name: "Blocked File Contract",
      version: 1,
      objective: "Write output to file",
      allowedTools: ["file_write"],
      createdAt: new Date(),
      updatedAt: new Date()
    });

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/executions",
      headers: { cookie: cookieA },
      payload: {
        projectId: "proj-1",
        agentId: "agent-1",
        contractId: "contract-file-blocked",
        objective: "Try writing files",
        riskScore: 10
      }
    });

    assert.equal(res.statusCode, 403);
    const body = JSON.parse(res.body);
    assert.equal(body.error.code, "FORBIDDEN");
    assert.match(body.error.message, /blocked by policy/i);
  });

  it("Execution Start Gating - allowedTools containing REQUIRE_APPROVAL gate but below riskLevel launches in QUEUED status", async () => {
    // Seed REQUIRE_APPROVAL gate for db_write with risk level 50
    mockStore.approvalGates.push({
      id: "gate-db-high",
      organizationId: "org-1",
      capability: "db_write",
      mode: "REQUIRE_APPROVAL",
      reason: "DB write requires review",
      riskLevel: 50,
      enabled: true,
      createdAt: new Date(),
      updatedAt: new Date()
    });

    // Seed task contract allowing db_write
    mockStore.taskContracts.push({
      id: "contract-db-safe",
      organizationId: "org-1",
      projectId: "proj-1",
      name: "Safe DB Contract",
      version: 1,
      objective: "Read DB values mostly",
      allowedTools: ["db_write"],
      createdAt: new Date(),
      updatedAt: new Date()
    });

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/executions",
      headers: { cookie: cookieA },
      payload: {
        projectId: "proj-1",
        agentId: "agent-1",
        contractId: "contract-db-safe",
        objective: "Perform safe DB updates",
        riskScore: 30 // bypasses gate (30 < 50)
      }
    });

    assert.equal(res.statusCode, 201);
    const exec = JSON.parse(res.body);
    assert.equal(exec.status, "QUEUED");
  });

  it("Execution Start Gating - MCP triggered execution includes metadata in audit logs", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/executions",
      headers: { cookie: cookieA },
      payload: {
        projectId: "proj-1",
        agentId: "agent-1",
        objective: "Direct execution",
        riskScore: 0,
        metadata: {
          source: "MCP",
          mcpTriggered: true
        }
      }
    });

    assert.equal(res.statusCode, 201);
    const exec = JSON.parse(res.body);

    const audit = mockStore.auditLogs.find((l) => l.targetId === exec.id);
    assert.ok(audit);
    assert.equal(audit.metadata.source, "MCP");
    assert.equal(audit.metadata.mcpTriggered, true);
  });
});
