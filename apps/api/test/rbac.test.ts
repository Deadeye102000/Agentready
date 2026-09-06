import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import crypto from "crypto";
import { buildServer } from "../src/server.js";
import { mockStore, resetMockStore } from "./mockPrisma.js";
import { signSession } from "@agentready/auth";
import { env } from "../src/lib/env.js";

describe("Role-Based Access Control (RBAC) Integration Tests", () => {
  let app: any;
  const rawApiKey = "ar_live_agent_key_test_123";

  beforeEach(async () => {
    resetMockStore();
    app = await buildServer();

    // Seed organization, agent, user, project, contract, and API key
    const org = { id: "org-1", name: "Test Org", slug: "test-org", createdAt: new Date(), updatedAt: new Date() };
    mockStore.organizations.push(org);

    const user = { id: "user-1", email: "user@example.com", name: "User", passwordHash: "hash", createdAt: new Date(), updatedAt: new Date() };
    mockStore.users.push(user);
    
    // Seed agent
    const agent = { id: "agent-1", organizationId: "org-1", name: "Agent 1", createdAt: new Date(), updatedAt: new Date() };
    mockStore.agentIdentities.push(agent);

    // Seed project
    const project = { id: "proj-1", organizationId: "org-1", name: "Project 1", status: "ACTIVE", createdAt: new Date(), updatedAt: new Date() };
    mockStore.projects.push(project);

    // Seed task contract
    const contract = {
      id: "contract-1",
      organizationId: "org-1",
      projectId: "proj-1",
      agentId: "agent-1",
      name: "Test Contract",
      version: 1,
      objective: "Test objective",
      inputs: {},
      successCriteria: [],
      allowedTools: ["test_tool"],
      requiredApprovals: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    mockStore.taskContracts.push(contract);

    // Seed API key for machine auth
    const keyHash = crypto.createHash("sha256").update(rawApiKey).digest("hex");
    mockStore.apiKeys.push({
      id: "key-1",
      organizationId: "org-1",
      agentId: "agent-1",
      name: "Agent API Key",
      keyPrefix: "ar_live_",
      keyHash,
      scopes: ["executions:write", "traces:write"],
      revokedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
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

  it("denies access to PUT /feature-flags for a user with role VIEWER (returns 403)", async () => {
    // Seed VIEWER membership
    mockStore.memberships.push({
      id: "mem-1",
      userId: "user-1",
      organizationId: "org-1",
      role: "VIEWER",
      createdAt: new Date(),
      updatedAt: new Date()
    });

    const cookie = getSessionCookie("user-1", "org-1");

    const res = await app.inject({
      method: "PUT",
      url: "/api/v1/feature-flags",
      headers: { cookie },
      payload: {
        agentId: "agent-1",
        capability: "file_write",
        state: "DISABLED"
      }
    });

    assert.equal(res.statusCode, 403);
    const body = JSON.parse(res.body);
    assert.equal(body.error.code, "FORBIDDEN");
    assert.match(body.error.message, /do not have permission/i);
  });

  it("allows access to PUT /feature-flags for a user with role ADMIN (bypasses 403)", async () => {
    // Seed ADMIN membership
    mockStore.memberships.push({
      id: "mem-2",
      userId: "user-1",
      organizationId: "org-1",
      role: "ADMIN",
      createdAt: new Date(),
      updatedAt: new Date()
    });

    const cookie = getSessionCookie("user-1", "org-1");

    const res = await app.inject({
      method: "PUT",
      url: "/api/v1/feature-flags",
      headers: { cookie },
      payload: {
        agentId: "agent-1",
        capability: "file_write",
        state: "DISABLED"
      }
    });

    // Bypass 403 - should return 200 OK (or success upsert response)
    assert.equal(res.statusCode, 200);
  });

  it("denies access to POST /approval-requests/:id/review for a user with role MEMBER (returns 403)", async () => {
    // Seed MEMBER membership
    mockStore.memberships.push({
      id: "mem-3",
      userId: "user-1",
      organizationId: "org-1",
      role: "MEMBER",
      createdAt: new Date(),
      updatedAt: new Date()
    });

    const cookie = getSessionCookie("user-1", "org-1");

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/approval-requests/req-123/review",
      headers: { cookie },
      payload: {
        status: "APPROVED",
        note: "LGTM"
      }
    });

    assert.equal(res.statusCode, 403);
    const body = JSON.parse(res.body);
    assert.equal(body.error.code, "FORBIDDEN");
    assert.match(body.error.message, /do not have permission/i);
  });
  
  it("allows access to POST /approval-requests/:id/review for a user with role APPROVER (bypasses 403)", async () => {
    // Seed APPROVER membership
    mockStore.memberships.push({
      id: "mem-4",
      userId: "user-1",
      organizationId: "org-1",
      role: "APPROVER",
      createdAt: new Date(),
      updatedAt: new Date()
    });

    // Seed approval request
    mockStore.approvalRequests.push({
      id: "req-123",
      organizationId: "org-1",
      agentId: "agent-1",
      requestedAction: "deploy.staging",
      reason: "Deploy needs review",
      status: "PENDING",
      createdAt: new Date(),
      updatedAt: new Date()
    });

    const cookie = getSessionCookie("user-1", "org-1");

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/approval-requests/req-123/review",
      headers: { cookie },
      payload: {
        status: "APPROVED",
        note: "Valid approver note"
      }
    });

    // Bypasses 403 - should return 200 OK (approved successfully)
    assert.equal(res.statusCode, 200);
    const body = JSON.parse(res.body);
    assert.equal(body.status, "APPROVED");
  });

  it("denies access to POST /task-contracts for a user with role MEMBER (returns 403)", async () => {
    mockStore.memberships.push({
      id: "mem-m1",
      userId: "user-1",
      organizationId: "org-1",
      role: "MEMBER",
      createdAt: new Date(),
      updatedAt: new Date()
    });

    const cookie = getSessionCookie("user-1", "org-1");

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/task-contracts",
      headers: { cookie },
      payload: {
        projectId: "proj-1",
        name: "Restricted Task Contract",
        objective: "Perform task",
        allowedTools: ["test_tool"]
      }
    });

    assert.equal(res.statusCode, 403);
    const body = JSON.parse(res.body);
    assert.equal(body.error.code, "FORBIDDEN");
    assert.match(body.error.message, /do not have permission/i);
  });

  it("denies access to POST /task-contracts for a machine API key caller (returns 403)", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/task-contracts",
      headers: { authorization: `Bearer ${rawApiKey}` },
      payload: {
        projectId: "proj-1",
        name: "Agent Attempt Contract",
        objective: "Perform task",
        allowedTools: ["test_tool"]
      }
    });

    assert.equal(res.statusCode, 403);
    const body = JSON.parse(res.body);
    assert.equal(body.error.code, "FORBIDDEN");
    assert.match(body.error.message, /do not have permission/i);
  });

  it("allows access to POST /task-contracts for a user with role ADMIN (returns 201)", async () => {
    mockStore.memberships.push({
      id: "mem-a1",
      userId: "user-1",
      organizationId: "org-1",
      role: "ADMIN",
      createdAt: new Date(),
      updatedAt: new Date()
    });

    const cookie = getSessionCookie("user-1", "org-1");

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/task-contracts",
      headers: { cookie },
      payload: {
        projectId: "proj-1",
        name: "Admin Task Contract",
        objective: "Perform task",
        allowedTools: ["test_tool"]
      }
    });

    assert.equal(res.statusCode, 201);
    const body = JSON.parse(res.body);
    assert.equal(body.name, "Admin Task Contract");
  });

  it("denies access to POST /eval-cases for a user with role MEMBER (returns 403)", async () => {
    mockStore.memberships.push({
      id: "mem-m2",
      userId: "user-1",
      organizationId: "org-1",
      role: "MEMBER",
      createdAt: new Date(),
      updatedAt: new Date()
    });

    const cookie = getSessionCookie("user-1", "org-1");

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/eval-cases",
      headers: { cookie },
      payload: {
        taskContractId: "contract-1",
        name: "Restricted Eval Case",
        input: { data: "test" },
        expectedStatus: "SUCCEEDED",
        expectedTools: ["test_tool"],
        successCriteria: "Criteria"
      }
    });

    assert.equal(res.statusCode, 403);
    const body = JSON.parse(res.body);
    assert.equal(body.error.code, "FORBIDDEN");
    assert.match(body.error.message, /do not have permission/i);
  });

  it("denies access to POST /eval-cases for a machine API key caller (returns 403)", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/eval-cases",
      headers: { authorization: `Bearer ${rawApiKey}` },
      payload: {
        taskContractId: "contract-1",
        name: "Agent Eval Case Attempt",
        input: { data: "test" },
        expectedStatus: "SUCCEEDED",
        expectedTools: ["test_tool"],
        successCriteria: "Criteria"
      }
    });

    assert.equal(res.statusCode, 403);
    const body = JSON.parse(res.body);
    assert.equal(body.error.code, "FORBIDDEN");
    assert.match(body.error.message, /do not have permission/i);
  });

  it("allows access to POST /eval-cases for a user with role OWNER (returns 201)", async () => {
    mockStore.memberships.push({
      id: "mem-o1",
      userId: "user-1",
      organizationId: "org-1",
      role: "OWNER",
      createdAt: new Date(),
      updatedAt: new Date()
    });

    const cookie = getSessionCookie("user-1", "org-1");

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/eval-cases",
      headers: { cookie },
      payload: {
        taskContractId: "contract-1",
        name: "Owner Eval Case",
        input: { data: "test" },
        expectedStatus: "SUCCEEDED",
        expectedTools: ["test_tool"],
        successCriteria: "Criteria"
      }
    });

    assert.equal(res.statusCode, 201);
    const body = JSON.parse(res.body);
    assert.equal(body.name, "Owner Eval Case");
  });
});
