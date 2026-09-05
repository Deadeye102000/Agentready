import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import crypto from "crypto";
import { buildServer } from "../src/server.js";
import { mockStore, resetMockStore } from "./mockPrisma.js";
import { signSession } from "@agentready/auth";
import { env } from "../src/lib/env.js";

describe("Synchronous Tool Call Governance & Lifecycle Integration Tests", () => {
  let app: any;
  const rawAgentKey = "ar_live_agentkey1234567890123456";
  const agentKeyHash = crypto.createHash("sha256").update(rawAgentKey).digest("hex");
  const agentKeyPrefix = "ar_live_agentk";

  const rawReadOnlyKey = "ar_live_readonlykey123456789012";
  const readOnlyKeyHash = crypto.createHash("sha256").update(rawReadOnlyKey).digest("hex");

  beforeEach(async () => {
    resetMockStore();
    app = await buildServer();

    // 1. Seed Organization & User
    const org = { id: "org-1", name: "Test Org", slug: "test-org", createdAt: new Date(), updatedAt: new Date() };
    mockStore.organizations.push(org);

    const user = { id: "user-1", email: "admin@example.com", name: "Admin", passwordHash: "hash", createdAt: new Date(), updatedAt: new Date() };
    mockStore.users.push(user);

    mockStore.memberships.push({
      id: "mem-1",
      userId: "user-1",
      organizationId: "org-1",
      role: "ADMIN",
      createdAt: new Date(),
      updatedAt: new Date()
    });

    // 2. Seed Agent & API Keys
    const agent = { id: "agent-1", organizationId: "org-1", name: "Worker Agent", createdAt: new Date(), updatedAt: new Date() };
    mockStore.agentIdentities.push(agent);

    mockStore.apiKeys.push({
      id: "key-agent",
      organizationId: "org-1",
      agentId: "agent-1",
      name: "Agent Runtime Key",
      keyPrefix: agentKeyPrefix,
      keyHash: agentKeyHash,
      scopes: ["tool_calls:check", "tool_calls:result", "executions:read", "executions:write"],
      revokedAt: null,
      expiresAt: null,
      createdAt: new Date(),
      updatedAt: new Date()
    });

    mockStore.apiKeys.push({
      id: "key-readonly",
      organizationId: "org-1",
      agentId: "agent-1",
      name: "Read-only Key",
      keyPrefix: "ar_live_readon",
      keyHash: readOnlyKeyHash,
      scopes: ["executions:read"],
      revokedAt: null,
      expiresAt: null,
      createdAt: new Date(),
      updatedAt: new Date()
    });

    // 3. Seed Project & Task Contract
    mockStore.projects.push({
      id: "proj-1",
      organizationId: "org-1",
      name: "Project 1",
      createdAt: new Date(),
      updatedAt: new Date()
    });

    mockStore.taskContracts.push({
      id: "contract-1",
      organizationId: "org-1",
      projectId: "proj-1",
      name: "Database Automation Contract",
      version: 1,
      objective: "Execute database tasks",
      allowedTools: ["db_query", "db_write", "safe_tool"],
      inputs: {},
      successCriteria: [],
      requiredApprovals: [],
      evalSpec: {},
      createdAt: new Date(),
      updatedAt: new Date()
    });

    // 4. Seed Execution in RUNNING status
    mockStore.agentExecutions.push({
      id: "exec-1",
      organizationId: "org-1",
      projectId: "proj-1",
      contractId: "contract-1",
      agentId: "agent-1",
      status: "RUNNING",
      objective: "Run guarded tools",
      input: {},
      riskScore: 60,
      attemptCount: 1,
      maxAttempts: 1,
      startedAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date()
    });
  });

  afterEach(async () => {
    if (app) {
      await app.close();
    }
  });

  const getSessionCookie = (userId: string, organizationId: string) => {
    const token = signSession(
      { userId, organizationId, exp: Math.floor(Date.now() / 1000) + 3600 },
      env.AUTH_SESSION_SECRET
    );
    return `agentready_session=${token}`;
  };

  it("enforces dedicated scopes: 403 on missing tool_calls:check and machine auth on result", async () => {
    // 1. Calling /check with unscoped key gets 403
    const checkRes = await app.inject({
      method: "POST",
      url: "/api/v1/executions/exec-1/tool-calls/check",
      headers: { authorization: `Bearer ${rawReadOnlyKey}` },
      payload: { toolName: "safe_tool", arguments: {} }
    });
    assert.equal(checkRes.statusCode, 403);

    // 2. Calling /result with session cookie gets 401 (machine auth required)
    const cookie = getSessionCookie("user-1", "org-1");
    const resultRes = await app.inject({
      method: "POST",
      url: "/api/v1/tool-calls/trace-1/result",
      headers: { cookie },
      payload: { status: "SUCCEEDED" }
    });
    assert.equal(resultRes.statusCode, 401);
  });

  it("enforces single-flight tool calls per execution (409 Conflict when a PENDING trace exists)", async () => {
    // 1. First tool call check returns ALLOW and creates PENDING trace
    const firstCheck = await app.inject({
      method: "POST",
      url: "/api/v1/executions/exec-1/tool-calls/check",
      headers: { authorization: `Bearer ${rawAgentKey}` },
      payload: { toolName: "safe_tool", arguments: { step: 1 } }
    });

    assert.equal(firstCheck.statusCode, 200);
    const firstData = JSON.parse(firstCheck.body);
    assert.equal(firstData.decision, "ALLOW");
    assert.equal(firstData.executionStatus, "RUNNING");
    assert.ok(firstData.toolCallTraceId);

    // 2. Second tool call check while first is still PENDING must return 409
    const secondCheck = await app.inject({
      method: "POST",
      url: "/api/v1/executions/exec-1/tool-calls/check",
      headers: { authorization: `Bearer ${rawAgentKey}` },
      payload: { toolName: "db_query", arguments: { query: "SELECT 1" } }
    });

    assert.equal(secondCheck.statusCode, 409);
    const secondError = JSON.parse(secondCheck.body);
    assert.equal(secondError.error.code, "CONCURRENT_TOOL_CALL_DISALLOWED");

    // 3. Complete the first tool call via /result
    const resultRes = await app.inject({
      method: "POST",
      url: `/api/v1/tool-calls/${firstData.toolCallTraceId}/result`,
      headers: { authorization: `Bearer ${rawAgentKey}` },
      payload: { status: "SUCCEEDED", output: { rows: [] } }
    });
    assert.equal(resultRes.statusCode, 200);

    // 4. Now second tool call check succeeds
    const thirdCheck = await app.inject({
      method: "POST",
      url: "/api/v1/executions/exec-1/tool-calls/check",
      headers: { authorization: `Bearer ${rawAgentKey}` },
      payload: { toolName: "db_query", arguments: { query: "SELECT 1" } }
    });
    assert.equal(thirdCheck.statusCode, 200);
    assert.equal(JSON.parse(thirdCheck.body).decision, "ALLOW");
  });

  it("handles idempotency: cached response on match, 409 conflict on differing body", async () => {
    const key = "idemp-key-test-1";

    // 1. Initial request with Idempotency-Key
    const res1 = await app.inject({
      method: "POST",
      url: "/api/v1/executions/exec-1/tool-calls/check",
      headers: {
        authorization: `Bearer ${rawAgentKey}`,
        "idempotency-key": key
      },
      payload: { toolName: "safe_tool", arguments: { count: 42 } }
    });

    assert.equal(res1.statusCode, 200);
    const body1 = JSON.parse(res1.body);
    assert.equal(body1.decision, "ALLOW");

    // 2. Exact same request with same idempotency key returns cached response
    const res2 = await app.inject({
      method: "POST",
      url: "/api/v1/executions/exec-1/tool-calls/check",
      headers: {
        authorization: `Bearer ${rawAgentKey}`,
        "idempotency-key": key
      },
      payload: { toolName: "safe_tool", arguments: { count: 42 } }
    });

    assert.equal(res2.statusCode, 200);
    const body2 = JSON.parse(res2.body);
    assert.equal(body2.toolCallTraceId, body1.toolCallTraceId);

    // 3. Same idempotency key with differing payload returns 409 Conflict
    const res3 = await app.inject({
      method: "POST",
      url: "/api/v1/executions/exec-1/tool-calls/check",
      headers: {
        authorization: `Bearer ${rawAgentKey}`,
        "idempotency-key": key
      },
      payload: { toolName: "safe_tool", arguments: { count: 999 } }
    });

    assert.equal(res3.statusCode, 409);
    assert.equal(JSON.parse(res3.body).error.code, "IDEMPOTENCY_KEY_MISMATCH");
  });

  it("canonicalizes arguments and redacts secrets/truncates oversized fields", async () => {
    // 1. Redaction of sensitive fields in arguments
    const checkRes = await app.inject({
      method: "POST",
      url: "/api/v1/executions/exec-1/tool-calls/check",
      headers: { authorization: `Bearer ${rawAgentKey}` },
      payload: {
        toolName: "safe_tool",
        arguments: {
          database_password: "supersecretpassword",
          api_key: "ar_live_sensitivecredentials",
          normalField: "visible",
          longField: "A".repeat(5000)
        }
      }
    });

    assert.equal(checkRes.statusCode, 200);
    const data = JSON.parse(checkRes.body);

    const savedTrace = mockStore.toolCallTraces.find(t => t.id === data.toolCallTraceId);
    assert.ok(savedTrace);
    assert.equal(savedTrace.input.database_password, "[REDACTED]");
    assert.equal(savedTrace.input.api_key, "[REDACTED]");
    assert.equal(savedTrace.input.normalField, "visible");
    assert.ok(savedTrace.input.longField.includes("[TRUNCATED"));
  });

  it("trips circuit breaker after 3 consecutive BLOCK decisions, transitioning execution to FAILED", async () => {
    // Block 1: tool not allowed by contract
    const b1 = await app.inject({
      method: "POST",
      url: "/api/v1/executions/exec-1/tool-calls/check",
      headers: { authorization: `Bearer ${rawAgentKey}` },
      payload: { toolName: "unauthorized_tool", arguments: {} }
    });
    assert.equal(b1.statusCode, 200);
    const data1 = JSON.parse(b1.body);
    assert.equal(data1.decision, "BLOCK");
    assert.equal(data1.consecutiveBlocks, 1);
    assert.equal(data1.executionStatus, "RUNNING");

    // Block 2
    const b2 = await app.inject({
      method: "POST",
      url: "/api/v1/executions/exec-1/tool-calls/check",
      headers: { authorization: `Bearer ${rawAgentKey}` },
      payload: { toolName: "unauthorized_tool", arguments: {} }
    });
    assert.equal(b2.statusCode, 200);
    const data2 = JSON.parse(b2.body);
    assert.equal(data2.decision, "BLOCK");
    assert.equal(data2.consecutiveBlocks, 2);
    assert.equal(data2.executionStatus, "RUNNING");

    // Block 3 -> Circuit breaker trips!
    const b3 = await app.inject({
      method: "POST",
      url: "/api/v1/executions/exec-1/tool-calls/check",
      headers: { authorization: `Bearer ${rawAgentKey}` },
      payload: { toolName: "unauthorized_tool", arguments: {} }
    });
    assert.equal(b3.statusCode, 200);
    const data3 = JSON.parse(b3.body);
    assert.equal(data3.decision, "BLOCK");
    assert.equal(data3.consecutiveBlocks, 3);
    assert.equal(data3.executionStatus, "FAILED");
    assert.ok(data3.reason.includes("Policy violation limit reached"));

    // Verify execution in database transitioned to FAILED
    const exec = mockStore.agentExecutions.find(e => e.id === "exec-1");
    assert.equal(exec.status, "FAILED");
    assert.equal(exec.failureReason, "POLICY_VIOLATION_LIMIT");
  });

  it("handles the complete approval-then-resume path: AWAITING_APPROVAL -> APPROVED -> resumed ALLOW -> CONSUMED -> result", async () => {
    // 1. Create an ApprovalGate requiring approval for db_write when risk >= 50
    mockStore.approvalGates.push({
      id: "gate-db-write",
      organizationId: "org-1",
      capability: "db_write",
      mode: "REQUIRE_APPROVAL",
      riskLevel: 50,
      enabled: true,
      reason: "Database mutations require human approval",
      createdAt: new Date(),
      updatedAt: new Date()
    });

    // 2. Call /check with db_write (riskScore is 60 >= 50)
    const checkRes = await app.inject({
      method: "POST",
      url: "/api/v1/executions/exec-1/tool-calls/check",
      headers: { authorization: `Bearer ${rawAgentKey}` },
      payload: { toolName: "db_write", arguments: { table: "users", action: "update" } }
    });

    assert.equal(checkRes.statusCode, 200);
    const checkData = JSON.parse(checkRes.body);
    assert.equal(checkData.decision, "WAIT_FOR_APPROVAL");
    assert.equal(checkData.executionStatus, "WAITING_FOR_APPROVAL");
    assert.ok(checkData.approvalRequestId);
    assert.ok(checkData.toolCallTraceId);

    // Verify trace is in AWAITING_APPROVAL status
    const trace = mockStore.toolCallTraces.find(t => t.id === checkData.toolCallTraceId);
    assert.ok(trace);
    assert.equal(trace.status, "AWAITING_APPROVAL");

    // Verify execution transitioned to WAITING_FOR_APPROVAL
    const exec = mockStore.agentExecutions.find(e => e.id === "exec-1");
    assert.equal(exec.status, "WAITING_FOR_APPROVAL");

    // 3. Human reviews and approves the request
    const adminCookie = getSessionCookie("user-1", "org-1");
    const reviewRes = await app.inject({
      method: "POST",
      url: `/api/v1/approval-requests/${checkData.approvalRequestId}/review`,
      headers: { cookie: adminCookie },
      payload: { status: "APPROVED", note: "Approved by DBA" }
    });
    assert.equal(reviewRes.statusCode, 200);

    // 4. Agent resumes and calls /check with identical tool & arguments (keys in different order)
    const resumeCheck = await app.inject({
      method: "POST",
      url: "/api/v1/executions/exec-1/tool-calls/check",
      headers: { authorization: `Bearer ${rawAgentKey}` },
      payload: {
        toolName: "db_write",
        arguments: { action: "update", table: "users" } // Reverse key order to verify canonicalization
      }
    });

    assert.equal(resumeCheck.statusCode, 200);
    const resumeData = JSON.parse(resumeCheck.body);
    assert.equal(resumeData.decision, "ALLOW");
    assert.equal(resumeData.toolCallTraceId, checkData.toolCallTraceId, "Must reuse in-place trace ID");
    assert.equal(resumeData.executionStatus, "RUNNING");

    // Verify trace transitioned in-place to PENDING
    assert.equal(trace.status, "PENDING");

    // Verify approval request is marked CONSUMED
    const approval = mockStore.approvalRequests.find(a => a.id === checkData.approvalRequestId);
    assert.equal(approval.status, "CONSUMED");

    // 5. Calling /check again for db_write CANNOT reuse consumed approval
    // Note: Since trace is now PENDING, single-flight guard will 409 until reported
    const completeTrace = await app.inject({
      method: "POST",
      url: `/api/v1/tool-calls/${trace.id}/result`,
      headers: { authorization: `Bearer ${rawAgentKey}` },
      payload: { status: "SUCCEEDED", output: { affected: 1 }, isFinalAction: true }
    });
    assert.equal(completeTrace.statusCode, 200);
    const resultBody = JSON.parse(completeTrace.body);
    assert.equal(resultBody.status, "SUCCEEDED");
    assert.equal(resultBody.executionStatus, "SUCCEEDED");

    // Verify execution transitioned to terminal SUCCEEDED
    assert.equal(exec.status, "SUCCEEDED");
  });

  it("handles the reject path: transitions linked ToolCallTrace from AWAITING_APPROVAL to BLOCKED", async () => {
    mockStore.approvalGates.push({
      id: "gate-reject-test",
      organizationId: "org-1",
      capability: "db_write",
      mode: "REQUIRE_APPROVAL",
      riskLevel: 10,
      enabled: true,
      createdAt: new Date(),
      updatedAt: new Date()
    });

    // 1. Call /check -> WAIT_FOR_APPROVAL
    const checkRes = await app.inject({
      method: "POST",
      url: "/api/v1/executions/exec-1/tool-calls/check",
      headers: { authorization: `Bearer ${rawAgentKey}` },
      payload: { toolName: "db_write", arguments: { query: "DROP TABLE" } }
    });

    const checkData = JSON.parse(checkRes.body);
    assert.equal(checkData.decision, "WAIT_FOR_APPROVAL");
    const trace = mockStore.toolCallTraces.find(t => t.id === checkData.toolCallTraceId);
    assert.equal(trace.status, "AWAITING_APPROVAL");

    // 2. Human reviews as REJECTED
    const adminCookie = getSessionCookie("user-1", "org-1");
    const reviewRes = await app.inject({
      method: "POST",
      url: `/api/v1/approval-requests/${checkData.approvalRequestId}/review`,
      headers: { cookie: adminCookie },
      payload: { status: "REJECTED", note: "Dangerous mutation rejected" }
    });
    assert.equal(reviewRes.statusCode, 200);

    // 3. Verify trace transitioned to BLOCKED
    assert.equal(trace.status, "BLOCKED");
    assert.ok(trace.error.includes("Dangerous mutation rejected") || trace.error.includes("rejected"));

    // Verify execution is FAILED
    const exec = mockStore.agentExecutions.find(e => e.id === "exec-1");
    assert.equal(exec.status, "FAILED");
  });

  it("handles the expire path: transitions linked ToolCallTrace from AWAITING_APPROVAL to BLOCKED when expired", async () => {
    mockStore.approvalGates.push({
      id: "gate-expire-test",
      organizationId: "org-1",
      capability: "db_write",
      mode: "REQUIRE_APPROVAL",
      riskLevel: 10,
      enabled: true,
      createdAt: new Date(),
      updatedAt: new Date()
    });

    // 1. Call /check -> WAIT_FOR_APPROVAL
    const checkRes = await app.inject({
      method: "POST",
      url: "/api/v1/executions/exec-1/tool-calls/check",
      headers: { authorization: `Bearer ${rawAgentKey}` },
      payload: { toolName: "db_write", arguments: { query: "VACUUM FULL" } }
    });

    const checkData = JSON.parse(checkRes.body);
    assert.equal(checkData.decision, "WAIT_FOR_APPROVAL");
    const trace = mockStore.toolCallTraces.find(t => t.id === checkData.toolCallTraceId);
    assert.equal(trace.status, "AWAITING_APPROVAL");

    // 2. Review with status EXPIRED
    const adminCookie = getSessionCookie("user-1", "org-1");
    const reviewRes = await app.inject({
      method: "POST",
      url: `/api/v1/approval-requests/${checkData.approvalRequestId}/review`,
      headers: { cookie: adminCookie },
      payload: { status: "EXPIRED" }
    });
    assert.equal(reviewRes.statusCode, 200);

    // 3. Verify trace transitioned to BLOCKED
    assert.equal(trace.status, "BLOCKED");
    assert.ok(trace.error.includes("expired") || trace.error.includes("Approval expired"));

    // Verify execution is FAILED
    const exec = mockStore.agentExecutions.find(e => e.id === "exec-1");
    assert.equal(exec.status, "FAILED");
  });

  it("handles state-based idempotency and ownership verification on /result", async () => {
    // 1. Create a PENDING trace
    const checkRes = await app.inject({
      method: "POST",
      url: "/api/v1/executions/exec-1/tool-calls/check",
      headers: { authorization: `Bearer ${rawAgentKey}` },
      payload: { toolName: "safe_tool", arguments: {} }
    });
    const { toolCallTraceId } = JSON.parse(checkRes.body);

    // 2. Unauthorized agent (different agentId) calling result gets 404
    mockStore.apiKeys.push({
      id: "key-other-agent",
      organizationId: "org-1",
      agentId: "other-agent-999",
      name: "Other Agent Key",
      keyPrefix: "ar_live_othera",
      keyHash: crypto.createHash("sha256").update("ar_live_otheragentkey").digest("hex"),
      scopes: ["tool_calls:result"],
      createdAt: new Date(),
      updatedAt: new Date()
    });

    const unauthRes = await app.inject({
      method: "POST",
      url: `/api/v1/tool-calls/${toolCallTraceId}/result`,
      headers: { authorization: "Bearer ar_live_otheragentkey" },
      payload: { status: "SUCCEEDED" }
    });
    assert.equal(unauthRes.statusCode, 404);

    // 3. Authorized agent reports result
    const res1 = await app.inject({
      method: "POST",
      url: `/api/v1/tool-calls/${toolCallTraceId}/result`,
      headers: { authorization: `Bearer ${rawAgentKey}` },
      payload: { status: "SUCCEEDED", output: { data: "success_1" } }
    });
    assert.equal(res1.statusCode, 200);
    assert.equal(JSON.parse(res1.body).status, "SUCCEEDED");

    // 4. Calling result again on already-SUCCEEDED trace is idempotent (returns existing result unchanged)
    const res2 = await app.inject({
      method: "POST",
      url: `/api/v1/tool-calls/${toolCallTraceId}/result`,
      headers: { authorization: `Bearer ${rawAgentKey}` },
      payload: { status: "FAILED", error: "Should be ignored" }
    });
    assert.equal(res2.statusCode, 200);
    const body2 = JSON.parse(res2.body);
    assert.equal(body2.status, "SUCCEEDED", "Must not alter status of already-succeeded trace");
  });
});
