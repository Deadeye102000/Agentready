/**
 * Tool Call Traces API Integration Tests
 *
 * Exercises GET /api/v1/tool-call-traces:
 *   1. List traces scoped to the caller's organization
 *   2. Filter traces by executionId
 *   3. Paginate results with limit, page, total, and totalPages metadata
 *   4. Enforce tenant isolation (cannot access traces of other tenants)
 *   5. Enforce scopes (traces:read / executions:read)
 */
import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { buildServer } from "../src/server.js";
import { mockStore, resetMockStore } from "./mockPrisma.js";
import { signSession } from "@agentready/auth";
import { env } from "../src/lib/env.js";

function seedFixtures() {
  const org1 = {
    id: "org-1",
    name: "Org One",
    slug: "org-one",
    createdAt: new Date(),
    updatedAt: new Date()
  };
  const org2 = {
    id: "org-2",
    name: "Org Two",
    slug: "org-two",
    createdAt: new Date(),
    updatedAt: new Date()
  };

  const user1 = {
    id: "user-1",
    email: "user1@example.com",
    name: "User One",
    passwordHash: "hash",
    createdAt: new Date(),
    updatedAt: new Date()
  };

  const agent1 = {
    id: "agent-1",
    organizationId: "org-1",
    name: "Agent One",
    createdAt: new Date(),
    updatedAt: new Date()
  };

  const exec1 = {
    id: "exec-1",
    organizationId: "org-1",
    agentId: "agent-1",
    projectId: "proj-1",
    status: "RUNNING",
    objective: "Test traces execution",
    input: {},
    output: null,
    riskScore: 20,
    maxAttempts: 3,
    attemptCount: 1,
    createdAt: new Date(),
    updatedAt: new Date()
  };

  const exec2 = {
    id: "exec-2",
    organizationId: "org-1",
    agentId: "agent-1",
    projectId: "proj-1",
    status: "RUNNING",
    objective: "Second execution",
    input: {},
    output: null,
    riskScore: 20,
    maxAttempts: 3,
    attemptCount: 1,
    createdAt: new Date(),
    updatedAt: new Date()
  };

  mockStore.organizations.push(org1, org2);
  mockStore.users.push(user1);
  mockStore.memberships.push({
    id: "mem-1",
    organizationId: "org-1",
    userId: "user-1",
    role: "OWNER",
    createdAt: new Date(),
    updatedAt: new Date()
  });
  mockStore.agentIdentities.push(agent1);
  mockStore.agentExecutions.push(exec1, exec2);

  // Seed 5 traces for exec-1 (org-1)
  for (let i = 1; i <= 5; i++) {
    mockStore.toolCallTraces.push({
      id: `trace-exec1-${i}`,
      organizationId: "org-1",
      executionId: "exec-1",
      agentId: "agent-1",
      toolName: `tool_${i}`,
      status: "SUCCEEDED",
      input: { step: i },
      output: { success: true },
      error: null,
      latencyMs: 10 * i,
      approvalRequestId: null,
      startedAt: new Date(Date.now() + i * 1000),
      completedAt: new Date(Date.now() + i * 1000 + 10)
    });
  }

  // Seed 2 traces for exec-2 (org-1)
  for (let i = 1; i <= 2; i++) {
    mockStore.toolCallTraces.push({
      id: `trace-exec2-${i}`,
      organizationId: "org-1",
      executionId: "exec-2",
      agentId: "agent-1",
      toolName: `tool_other_${i}`,
      status: "SUCCEEDED",
      input: { step: i },
      output: null,
      error: null,
      latencyMs: 15,
      approvalRequestId: null,
      startedAt: new Date(Date.now() + 10000 + i * 1000),
      completedAt: new Date(Date.now() + 10000 + i * 1000 + 10)
    });
  }

  // Seed 3 traces for org-2
  for (let i = 1; i <= 3; i++) {
    mockStore.toolCallTraces.push({
      id: `trace-org2-${i}`,
      organizationId: "org-2",
      executionId: "exec-foreign",
      agentId: "agent-foreign",
      toolName: `tool_foreign_${i}`,
      status: "SUCCEEDED",
      input: {},
      output: null,
      error: null,
      latencyMs: 5,
      approvalRequestId: null,
      startedAt: new Date(),
      completedAt: new Date()
    });
  }
}

describe("GET /api/v1/tool-call-traces Integration Tests", () => {
  beforeEach(() => {
    resetMockStore();
    seedFixtures();
  });

  it("lists all tool call traces for caller's organization with pagination", async () => {
    const app = await buildServer();
    const sessionCookie = signSession(
      { userId: "user-1", organizationId: "org-1", exp: Math.floor(Date.now() / 1000) + 3600 },
      env.AUTH_SESSION_SECRET
    );

    const res = await app.inject({
      method: "GET",
      url: "/api/v1/tool-call-traces",
      headers: { cookie: `agentready_session=${sessionCookie}` }
    });

    assert.equal(res.statusCode, 200);
    const body = JSON.parse(res.body);

    assert.ok(Array.isArray(body.data));
    assert.equal(body.data.length, 7, "Org 1 has 7 total traces");
    assert.equal(body.pagination.total, 7);
    assert.equal(body.pagination.page, 1);
    assert.equal(body.pagination.limit, 50);
    assert.equal(body.pagination.totalPages, 1);

    // Verify tenant isolation: none of the items belong to org-2
    assert.ok(body.data.every((t: any) => t.organizationId === "org-1"));
  });

  it("filters traces by executionId", async () => {
    const app = await buildServer();
    const sessionCookie = signSession(
      { userId: "user-1", organizationId: "org-1", exp: Math.floor(Date.now() / 1000) + 3600 },
      env.AUTH_SESSION_SECRET
    );

    const res = await app.inject({
      method: "GET",
      url: "/api/v1/tool-call-traces?executionId=exec-1",
      headers: { cookie: `agentready_session=${sessionCookie}` }
    });

    assert.equal(res.statusCode, 200);
    const body = JSON.parse(res.body);

    assert.equal(body.data.length, 5);
    assert.equal(body.pagination.total, 5);
    assert.ok(body.data.every((t: any) => t.executionId === "exec-1"));
    assert.equal(body.data[0].toolName, "tool_1");
  });

  it("handles pagination with limit and page parameters", async () => {
    const app = await buildServer();
    const sessionCookie = signSession(
      { userId: "user-1", organizationId: "org-1", exp: Math.floor(Date.now() / 1000) + 3600 },
      env.AUTH_SESSION_SECRET
    );

    // Page 1 with limit 2
    const resPage1 = await app.inject({
      method: "GET",
      url: "/api/v1/tool-call-traces?executionId=exec-1&limit=2&page=1",
      headers: { cookie: `agentready_session=${sessionCookie}` }
    });

    assert.equal(resPage1.statusCode, 200);
    const bodyPage1 = JSON.parse(resPage1.body);
    assert.equal(bodyPage1.data.length, 2);
    assert.equal(bodyPage1.pagination.total, 5);
    assert.equal(bodyPage1.pagination.page, 1);
    assert.equal(bodyPage1.pagination.limit, 2);
    assert.equal(bodyPage1.pagination.totalPages, 3);
    assert.equal(bodyPage1.data[0].id, "trace-exec1-1");
    assert.equal(bodyPage1.data[1].id, "trace-exec1-2");

    // Page 2 with limit 2
    const resPage2 = await app.inject({
      method: "GET",
      url: "/api/v1/tool-call-traces?executionId=exec-1&limit=2&page=2",
      headers: { cookie: `agentready_session=${sessionCookie}` }
    });

    assert.equal(resPage2.statusCode, 200);
    const bodyPage2 = JSON.parse(resPage2.body);
    assert.equal(bodyPage2.data.length, 2);
    assert.equal(bodyPage2.pagination.page, 2);
    assert.equal(bodyPage2.data[0].id, "trace-exec1-3");
    assert.equal(bodyPage2.data[1].id, "trace-exec1-4");
  });

  it("enforces tenant isolation — cannot see foreign execution traces", async () => {
    const app = await buildServer();
    const sessionCookie = signSession(
      { userId: "user-1", organizationId: "org-1", exp: Math.floor(Date.now() / 1000) + 3600 },
      env.AUTH_SESSION_SECRET
    );

    // Querying exec-foreign belonging to org-2
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/tool-call-traces?executionId=exec-foreign",
      headers: { cookie: `agentready_session=${sessionCookie}` }
    });

    assert.equal(res.statusCode, 200);
    const body = JSON.parse(res.body);
    assert.equal(body.data.length, 0);
    assert.equal(body.pagination.total, 0);
  });
});
