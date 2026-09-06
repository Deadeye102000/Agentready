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

// ---------------------------------------------------------------------------
// Role Revocation Regression Tests
// ---------------------------------------------------------------------------
// These tests verify that role checks are evaluated against the LIVE database
// state on every request. A session token is intentionally long-lived (valid
// for 1 hour), but if the underlying membership role is downgraded AFTER the
// token is issued, the very next request must be denied — not allowed because
// the token was valid at login time.
// ---------------------------------------------------------------------------
describe("Role Revocation Regression Tests", () => {
  let app: any;

  beforeEach(async () => {
    resetMockStore();
    app = await buildServer();

    // Seed organization
    mockStore.organizations.push({
      id: "org-revoke",
      name: "Revoke Org",
      slug: "revoke-org",
      createdAt: new Date(),
      updatedAt: new Date()
    });

    // Seed user
    mockStore.users.push({
      id: "user-revoke",
      email: "revoke@example.com",
      name: "Revoke User",
      passwordHash: "hash",
      createdAt: new Date(),
      updatedAt: new Date()
    });

    // Seed agent for feature-flag tests
    mockStore.agentIdentities.push({
      id: "agent-revoke",
      organizationId: "org-revoke",
      name: "Revoke Agent",
      createdAt: new Date(),
      updatedAt: new Date()
    });
  });

  afterEach(async () => {
    if (app) await app.close();
  });

  it("rejects the next request after ADMIN role is demoted to VIEWER mid-session", async () => {
    // Step 1: Seed the user as ADMIN
    const membership = {
      id: "mem-revoke",
      userId: "user-revoke",
      organizationId: "org-revoke",
      role: "ADMIN" as const,
      createdAt: new Date(),
      updatedAt: new Date()
    };
    mockStore.memberships.push(membership);

    // Step 2: Issue a session token (valid for 1 hour — simulates a long-lived session)
    const token = signSession(
      { userId: "user-revoke", organizationId: "org-revoke", exp: Math.floor(Date.now() / 1000) + 3600 },
      env.AUTH_SESSION_SECRET
    );
    const cookie = `agentready_session=${token}`;

    // Step 3: Confirm the ADMIN can access a privileged endpoint before demotion
    const beforeRes = await app.inject({
      method: "PUT",
      url: "/api/v1/feature-flags",
      headers: { cookie },
      payload: {
        agentId: "agent-revoke",
        capability: "file_write",
        state: "DISABLED"
      }
    });
    // Expect 200 (or any non-403) — the ADMIN is currently authorized
    assert.notEqual(
      beforeRes.statusCode,
      403,
      `Expected ADMIN to be allowed before demotion, got ${beforeRes.statusCode}: ${beforeRes.body}`
    );

    // Step 4: Demote the role to VIEWER in the mock store (simulates a DB update)
    const idx = mockStore.memberships.findIndex((m) => m.id === "mem-revoke");
    assert.ok(idx !== -1, "Membership should exist in mock store");
    mockStore.memberships[idx] = { ...mockStore.memberships[idx], role: "VIEWER" };

    // Step 5: Make the very next request with the SAME session token
    // The token itself is still cryptographically valid — but role is now VIEWER.
    const afterRes = await app.inject({
      method: "PUT",
      url: "/api/v1/feature-flags",
      headers: { cookie },
      payload: {
        agentId: "agent-revoke",
        capability: "file_write",
        state: "DISABLED"
      }
    });

    // The server must re-read the membership role on every request.
    // A VIEWER does not have OWNER/ADMIN privilege on this endpoint → must be 403.
    assert.equal(
      afterRes.statusCode,
      403,
      `Expected 403 after role demotion, got ${afterRes.statusCode}: ${afterRes.body}`
    );
    const body = JSON.parse(afterRes.body);
    assert.equal(body.error.code, "FORBIDDEN");
  });

  it("rejects the next request after membership is fully removed mid-session", async () => {
    // Step 1: Seed the user as OWNER
    mockStore.memberships.push({
      id: "mem-removed",
      userId: "user-revoke",
      organizationId: "org-revoke",
      role: "OWNER" as const,
      createdAt: new Date(),
      updatedAt: new Date()
    });

    const token = signSession(
      { userId: "user-revoke", organizationId: "org-revoke", exp: Math.floor(Date.now() / 1000) + 3600 },
      env.AUTH_SESSION_SECRET
    );
    const cookie = `agentready_session=${token}`;

    // Step 2: Confirm they can access a privileged endpoint as OWNER
    const beforeRes = await app.inject({
      method: "PUT",
      url: "/api/v1/feature-flags",
      headers: { cookie },
      payload: { agentId: "agent-revoke", capability: "file_write", state: "DISABLED" }
    });
    assert.notEqual(beforeRes.statusCode, 403, `Expected OWNER to be allowed, got ${beforeRes.statusCode}`);

    // Step 3: Remove the membership entirely (e.g., user was kicked from the org)
    mockStore.memberships = mockStore.memberships.filter((m) => m.id !== "mem-removed");

    // Step 4: The same session token is now orphaned — membership lookup returns null
    const afterRes = await app.inject({
      method: "PUT",
      url: "/api/v1/feature-flags",
      headers: { cookie },
      payload: { agentId: "agent-revoke", capability: "file_write", state: "DISABLED" }
    });

    // With no membership, the user is no longer a member of the org.
    // The auth plugin returns 401 (UNAUTHORIZED) since it cannot establish an org context,
    // which is equivalent to access denial. Both 401 and 403 are correct here.
    assert.ok(
      afterRes.statusCode === 401 || afterRes.statusCode === 403,
      `Expected 401 or 403 after membership removal, got ${afterRes.statusCode}: ${afterRes.body}`
    );
    const body = JSON.parse(afterRes.body);
    assert.ok(
      body.error.code === "UNAUTHORIZED" || body.error.code === "FORBIDDEN",
      `Expected UNAUTHORIZED or FORBIDDEN error code, got ${body.error.code}`
    );
  });
});

