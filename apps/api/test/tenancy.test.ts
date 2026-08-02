import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { buildServer } from "../src/server.js";
import { mockStore, resetMockStore } from "./mockPrisma.js";
import { signSession } from "@agentready/auth";
import { env } from "../src/lib/env.js";

describe("Tenancy Integration Tests", () => {
  let app: any;
  let cookieA: string;
  let cookieB: string;

  beforeEach(async () => {
    resetMockStore();
    app = await buildServer();

    // 1. Seed two organizations
    const orgAlpha = { id: "org-alpha", name: "Org Alpha", slug: "org-alpha", createdAt: new Date(), updatedAt: new Date() };
    const orgBeta = { id: "org-beta", name: "Org Beta", slug: "org-beta", createdAt: new Date(), updatedAt: new Date() };
    mockStore.organizations.push(orgAlpha, orgBeta);

    // 2. Seed users
    const userA = { id: "user-a", email: "user-a@example.com", name: "User A", passwordHash: "hashA", createdAt: new Date(), updatedAt: new Date() };
    const userB = { id: "user-b", email: "user-b@example.com", name: "User B", passwordHash: "hashB", createdAt: new Date(), updatedAt: new Date() };
    mockStore.users.push(userA, userB);

    // 3. Seed memberships
    mockStore.memberships.push(
      { id: "mem-a", userId: "user-a", organizationId: "org-alpha", role: "OWNER", createdAt: new Date(), updatedAt: new Date() },
      { id: "mem-b", userId: "user-b", organizationId: "org-beta", role: "OWNER", createdAt: new Date(), updatedAt: new Date() }
    );

    // 4. Seed agent identities
    const agentAlpha = { id: "agent-alpha", organizationId: "org-alpha", name: "Agent Alpha", createdAt: new Date(), updatedAt: new Date() };
    const agentBeta = { id: "agent-beta", organizationId: "org-beta", name: "Agent Beta", createdAt: new Date(), updatedAt: new Date() };
    mockStore.agentIdentities.push(agentAlpha, agentBeta);

    // 5. Seed project for Org Alpha
    const projectAlpha = {
      id: "project-alpha",
      organizationId: "org-alpha",
      name: "Project Alpha",
      status: "ACTIVE",
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    mockStore.projects.push(projectAlpha);

    // 6. Generate authenticated cookies
    const tokenA = signSession(
      { userId: "user-a", organizationId: "org-alpha", exp: Math.floor(Date.now() / 1000) + 3600 },
      env.AUTH_SESSION_SECRET
    );
    cookieA = `agentready_session=${tokenA}`;

    const tokenB = signSession(
      { userId: "user-b", organizationId: "org-beta", exp: Math.floor(Date.now() / 1000) + 3600 },
      env.AUTH_SESSION_SECRET
    );
    cookieB = `agentready_session=${tokenB}`;
  });

  it("User A can successfully create and query executions within Org Alpha", async () => {
    // User A creates execution on project-alpha (belongs to org-alpha)
    const createRes = await app.inject({
      method: "POST",
      url: "/api/v1/executions",
      headers: { cookie: cookieA },
      payload: {
        projectId: "project-alpha",
        agentId: "agent-alpha",
        objective: "Build a test plan",
        input: { task: "setup tests" },
        riskScore: 2,
      },
    });

    assert.equal(createRes.statusCode, 201);
    const execution = JSON.parse(createRes.body);
    assert.equal(execution.projectId, "project-alpha");
    assert.equal(execution.organizationId, "org-alpha");

    // User A can fetch it back
    const getRes = await app.inject({
      method: "GET",
      url: `/api/v1/executions/${execution.id}`,
      headers: { cookie: cookieA },
    });

    assert.equal(getRes.statusCode, 200);
    const fetched = JSON.parse(getRes.body);
    assert.equal(fetched.id, execution.id);
  });

  it("User B is forbidden from creating executions on User A's project", async () => {
    // User B tries to target project-alpha (which belongs to org-alpha)
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/executions",
      headers: { cookie: cookieB },
      payload: {
        projectId: "project-alpha", // Target Org Alpha's project
        agentId: "agent-beta",
        objective: "Malicious run",
        input: {},
      },
    });

    // Should return 403 Forbidden since project-alpha belongs to org-alpha
    assert.equal(res.statusCode, 403);
    const body = JSON.parse(res.body);

    assert.ok(body.error);
    assert.equal(body.error.code, "FORBIDDEN");
    assert.equal(body.error.message, "Project does not belong to this organization");
    
    // Check no metadata leak in error
    assert.ok(body.error.details.requestId);
    assert.equal(Object.keys(body.error.details).length, 1); // Only requestId
  });

  it("User B receives 404 Not Found when trying to fetch an execution belonging to User A", async () => {
    // Seed an execution belonging to org-alpha
    const execAlpha = {
      id: "exec-alpha",
      organizationId: "org-alpha",
      projectId: "project-alpha",
      agentId: "agent-alpha",
      status: "QUEUED",
      objective: "Test objective",
      input: {},
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    mockStore.agentExecutions.push(execAlpha);

    const res = await app.inject({
      method: "GET",
      url: `/api/v1/executions/exec-alpha`,
      headers: { cookie: cookieB }, // Auth as User B
    });

    // Should return 404 Not Found to prevent data existence leakage
    assert.equal(res.statusCode, 404);
    const body = JSON.parse(res.body);
    assert.equal(body.error.code, "NOT_FOUND");
    assert.equal(body.error.message, "Agent execution was not found");
  });
});
