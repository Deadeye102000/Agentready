import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { buildServer } from "../src/server.js";
import { mockStore, resetMockStore } from "./mockPrisma.js";
import { signSession } from "@agentready/auth";
import { env } from "../src/lib/env.js";

describe("Feature Flags Integration Tests", () => {
  let app: any;
  let cookieA: string;

  beforeEach(async () => {
    resetMockStore();
    app = await buildServer();

    // Seed org, user, membership, project, agent, feature flags
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

    const contract = { id: "contract-1", organizationId: "org-1", name: "Contract 1", version: 1, fileContent: "content", createdAt: new Date(), updatedAt: new Date() };
    mockStore.taskContracts.push(contract);

    const task = { id: "task-1", organizationId: "org-1", projectId: "proj-1", title: "Task 1", status: "TODO", createdAt: new Date(), updatedAt: new Date() };
    mockStore.tasks.push(task);

    const token = signSession(
      { userId: "user-1", organizationId: "org-1", exp: Math.floor(Date.now() / 1000) + 3600 },
      env.AUTH_SESSION_SECRET
    );
    cookieA = `agentready_session=${token}`;
  });

  it("1. Agent Execution - agent_execution flag disabled blocks execution creation", async () => {
    // Seed DISABLED flag for agent_execution
    mockStore.featureFlags.push({
      id: "flag-exec",
      organizationId: "org-1",
      agentId: null,
      capability: "agent_execution",
      state: "DISABLED",
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/executions",
      headers: { cookie: cookieA },
      payload: {
        projectId: "proj-1",
        taskId: "task-1",
        contractId: "contract-1",
        agentId: "agent-1",
        objective: "Test objective",
        input: {},
        riskScore: 10,
      },
    });

    assert.equal(res.statusCode, 403);
    const body = JSON.parse(res.body);
    assert.match(body.error.message, /disabled by feature flag/);
  });

  it("2. Tool Execution - tool_execution global flag disabled blocks tool execution and fails execution run", async () => {
    // Seed DISABLED global tool_execution flag
    mockStore.featureFlags.push({
      id: "flag-tool",
      organizationId: "org-1",
      agentId: null,
      capability: "tool_execution",
      state: "DISABLED",
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const exec = {
      id: "exec-1",
      organizationId: "org-1",
      projectId: "proj-1",
      agentId: "agent-1",
      status: "RUNNING",
      objective: "Objective",
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
        executionId: "exec-1",
        agentId: "agent-1",
        toolName: "file_write",
        status: "RUNNING",
        input: {},
      },
    });

    assert.equal(res.statusCode, 201);
    const trace = JSON.parse(res.body);
    assert.equal(trace.status, "BLOCKED");
    assert.match(trace.error, /disabled.*feature flag/);

    // Verify execution status transitioned to FAILED and output records the block
    const updatedExec = mockStore.agentExecutions.find((e) => e.id === "exec-1");
    assert.equal(updatedExec.status, "FAILED");
    assert.match(updatedExec.output.error, /disabled by feature flag/);
  });

  it("3. Evaluation Runner - eval_runner flag disabled blocks evaluation run creation", async () => {
    // Seed DISABLED eval_runner flag
    mockStore.featureFlags.push({
      id: "flag-eval",
      organizationId: "org-1",
      agentId: null,
      capability: "eval_runner",
      state: "DISABLED",
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const exec = {
      id: "exec-1",
      organizationId: "org-1",
      projectId: "proj-1",
      agentId: "agent-1",
      status: "RUNNING",
      objective: "Objective",
      input: {},
      riskScore: 10,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    mockStore.agentExecutions.push(exec);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/eval-runs",
      headers: { cookie: cookieA },
      payload: {
        projectId: "proj-1",
        executionId: "exec-1",
        contractId: "contract-1",
        agentId: "agent-1",
        name: "Smoke Test Eval",
        status: "PASSED",
        score: 1.0,
        threshold: 0.8,
        checks: [],
        findings: [],
      },
    });

    assert.equal(res.statusCode, 403);
    const body = JSON.parse(res.body);
    assert.match(body.error.message, /disabled by feature flag/);
  });

  it("4. MCP Server Access - mcp_server_access flag disabled blocks listing MCP servers", async () => {
    // Seed DISABLED mcp_server_access flag
    mockStore.featureFlags.push({
      id: "flag-mcp",
      organizationId: "org-1",
      agentId: null,
      capability: "mcp_server_access",
      state: "DISABLED",
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const res = await app.inject({
      method: "GET",
      url: "/api/v1/mcp-servers",
      headers: { cookie: cookieA },
    });

    assert.equal(res.statusCode, 403);
    const body = JSON.parse(res.body);
    assert.match(body.error.message, /disabled by feature flag/);
  });

  it("5. Auto Approval Bypass - auto_approval flag disabled overrides AUTOMATIC gate mode to REQUIRE_APPROVAL", async () => {
    // Seed DISABLED auto_approval flag
    mockStore.featureFlags.push({
      id: "flag-auto",
      organizationId: "org-1",
      agentId: null,
      capability: "auto_approval",
      state: "DISABLED",
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    // Seed AUTOMATIC gate for db_write
    mockStore.approvalGates.push({
      id: "gate-db",
      organizationId: "org-1",
      capability: "db_write",
      mode: "AUTOMATIC",
      reason: "Bypass review",
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
      objective: "Objective",
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
        executionId: "exec-1",
        agentId: "agent-1",
        toolName: "db_write",
        status: "RUNNING",
        input: {},
      },
    });

    assert.equal(res.statusCode, 201);
    const trace = JSON.parse(res.body);
    assert.equal(trace.status, "BLOCKED");
    assert.equal(trace.error, "approval_requested"); // was NOT auto-approved!
    assert.ok(trace.approvalRequestId);
  });

  it("6. Toggle Feature Flag API - toggles flag state and writes audit logs", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/feature-flags/toggle",
      headers: { cookie: cookieA },
      payload: {
        capability: "agent_execution",
      },
    });

    assert.equal(res.statusCode, 200);
    const body = JSON.parse(res.body);
    assert.equal(body.state, "ENABLED"); // toggles from default undefined (or default off depending on toggling logic; toggle state will be ENABLED)

    // Verify toggled state persisted in mockStore
    const toggledFlag = mockStore.featureFlags.find((f) => f.capability === "agent_execution");
    assert.ok(toggledFlag);
    assert.equal(toggledFlag.state, "ENABLED");

    // Verify toggle writes audit log
    const auditLog = mockStore.auditLogs.find((l) => l.action === "feature_flag.toggled");
    assert.ok(auditLog);
    assert.equal(auditLog.actorUserId, "user-1");
  });
});
