import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { buildServer } from "../src/server.js";
import { mockStore, resetMockStore } from "./mockPrisma.js";
import { signSession } from "@agentready/auth";
import { env } from "../src/lib/env.js";

describe("Evaluation Framework Integration Tests", () => {
  let app: any;
  let cookieA: string;

  beforeEach(async () => {
    resetMockStore();
    app = await buildServer();

    // Seed organization, user, membership, project, agent, contract
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

    const project = { id: "proj-1", organizationId: "org-1", name: "Project 1", status: "ACTIVE", createdAt: new Date(), updatedAt: new Date() };
    mockStore.projects.push(project);

    const contract = {
      id: "contract-1",
      organizationId: "org-1",
      projectId: "proj-1",
      agentId: "agent-1",
      name: "Write File Contract",
      version: 1,
      objective: "Write content to a file safely",
      inputs: {},
      successCriteria: [],
      allowedTools: ["file_write"],
      requiredApprovals: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    mockStore.taskContracts.push(contract);

    const token = signSession(
      { userId: "user-1", organizationId: "org-1", exp: Math.floor(Date.now() / 1000) + 3600 },
      env.AUTH_SESSION_SECRET
    );
    cookieA = `agentready_session=${token}`;
  });

  it("1. POST /eval-cases - successfully creates an evaluation case", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/eval-cases",
      headers: { cookie: cookieA },
      payload: {
        taskContractId: "contract-1",
        name: "Verify file writing capabilities",
        input: { data: "hello" },
        expectedStatus: "SUCCEEDED",
        expectedTools: ["file_write"],
        successCriteria: "Writes file cleanly",
      },
    });

    assert.equal(res.statusCode, 201);
    const body = JSON.parse(res.body);
    assert.equal(body.name, "Verify file writing capabilities");
    assert.equal(body.expectedStatus, "SUCCEEDED");
    assert.deepEqual(body.expectedTools, ["file_write"]);
    assert.equal(mockStore.evalCases.length, 1);
  });

  it("2. GET /eval-cases - lists evaluation cases scoped to organization", async () => {
    // Seed cases
    mockStore.evalCases.push({
      id: "case-1",
      organizationId: "org-1",
      taskContractId: "contract-1",
      name: "Case 1",
      input: {},
      expectedStatus: "SUCCEEDED",
      expectedTools: [],
      successCriteria: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const res = await app.inject({
      method: "GET",
      url: "/api/v1/eval-cases",
      headers: { cookie: cookieA },
    });

    assert.equal(res.statusCode, 200);
    const list = JSON.parse(res.body);
    assert.equal(list.length, 1);
    assert.equal(list[0].id, "case-1");
  });

  it("3. POST /eval-cases/:id/run - executes single case successfully (PASSED)", async () => {
    // Seed case
    mockStore.evalCases.push({
      id: "case-1",
      organizationId: "org-1",
      taskContractId: "contract-1",
      name: "Successful Case",
      input: { data: "success-input" },
      expectedStatus: "SUCCEEDED",
      expectedTools: ["file_write"],
      successCriteria: "Writes successfully",
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/eval-cases/case-1/run",
      headers: { cookie: cookieA },
    });

    assert.equal(res.statusCode, 200);
    const run = JSON.parse(res.body);
    assert.equal(run.status, "PASSED");
    assert.equal(run.score, 1.0);
    assert.equal(run.failureReason, null);
    assert.ok(run.executionId);
    assert.ok(run.duration >= 0);

    // Verify mock execution states
    const execution = mockStore.agentExecutions.find((e) => e.id === run.executionId);
    assert.ok(execution);
    assert.equal(execution.status, "SUCCEEDED");

    // Verify tool traces matching expectedTools
    const traces = mockStore.toolCallTraces.filter((t) => t.executionId === run.executionId);
    assert.equal(traces.length, 1);
    assert.equal(traces[0].toolName, "file_write");
  });

  it("4. POST /eval-cases/:id/run (simulateFailure) - executes case and fails (FAILED)", async () => {
    // Seed case with simulateFailure inside input payload
    mockStore.evalCases.push({
      id: "case-fail",
      organizationId: "org-1",
      taskContractId: "contract-1",
      name: "Failing Case",
      input: { simulateFailure: true },
      expectedStatus: "SUCCEEDED",
      expectedTools: ["file_write"],
      successCriteria: "Fail on simulateFailure",
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/eval-cases/case-fail/run",
      headers: { cookie: cookieA },
    });

    assert.equal(res.statusCode, 200);
    const run = JSON.parse(res.body);
    assert.equal(run.status, "FAILED");
    assert.equal(run.score, 0.0); // status mismatch + tools mismatch -> (0+0)/2 = 0
    assert.match(run.failureReason, /Expected status SUCCEEDED but execution ended with FAILED/);

    const execution = mockStore.agentExecutions.find((e) => e.id === run.executionId);
    assert.ok(execution);
    assert.equal(execution.status, "FAILED");
  });

  it("5. POST /eval-suites/run - executes all cases in suite", async () => {
    // Seed two cases
    mockStore.evalCases.push({
      id: "case-1",
      organizationId: "org-1",
      taskContractId: "contract-1",
      name: "Case 1",
      input: {},
      expectedStatus: "SUCCEEDED",
      expectedTools: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    mockStore.evalCases.push({
      id: "case-2",
      organizationId: "org-1",
      taskContractId: "contract-1",
      name: "Case 2",
      input: {},
      expectedStatus: "SUCCEEDED",
      expectedTools: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/eval-suites/run",
      headers: { cookie: cookieA },
      payload: {
        taskContractId: "contract-1",
      },
    });

    assert.equal(res.statusCode, 200);
    const runs = JSON.parse(res.body);
    assert.equal(runs.length, 2);
    assert.equal(runs[0].status, "PASSED");
    assert.equal(runs[1].status, "PASSED");
  });

  it("6. Feature Flags - blocks cases and runs when eval_runner is disabled", async () => {
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

    // 1. Block createCase
    let res = await app.inject({
      method: "POST",
      url: "/api/v1/eval-cases",
      headers: { cookie: cookieA },
      payload: {
        taskContractId: "contract-1",
        name: "Blocked Case",
      },
    });
    assert.equal(res.statusCode, 403);

    // 2. Block runCase
    res = await app.inject({
      method: "POST",
      url: "/api/v1/eval-cases/case-1/run",
      headers: { cookie: cookieA },
    });
    assert.equal(res.statusCode, 403);
  });

  it("7. POST /eval-cases/:id/run - rejects invalid/empty id with 400 VALIDATION_ERROR", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/eval-cases/%20/run",
      headers: { cookie: cookieA },
    });
    assert.equal(res.statusCode, 400);
    const body = JSON.parse(res.body);
    assert.equal(body.error.code, "VALIDATION_ERROR");
  });
});
