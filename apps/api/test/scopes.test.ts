import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { buildServer } from "../src/server.js";
import { mockStore, resetMockStore } from "./mockPrisma.js";
import { signSession } from "@agentready/auth";
import { env } from "../src/lib/env.js";
import { hasScope } from "../src/modules/auth/scopes.js";

describe("API Key Scope Enforcement Tests", () => {
  let app: any;

  beforeEach(async () => {
    resetMockStore();
    app = await buildServer();

    // Seed organization, user, membership, agent, and project
    const org = { id: "org-1", name: "Test Org", slug: "test-org", createdAt: new Date(), updatedAt: new Date() };
    mockStore.organizations.push(org);

    const user = { id: "user-1", email: "user@example.com", name: "Admin User", passwordHash: "hash", createdAt: new Date(), updatedAt: new Date() };
    mockStore.users.push(user);

    mockStore.memberships.push({
      id: "mem-1",
      userId: "user-1",
      organizationId: "org-1",
      role: "ADMIN",
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const agent = { id: "agent-1", organizationId: "org-1", name: "Agent 1", createdAt: new Date(), updatedAt: new Date() };
    mockStore.agentIdentities.push(agent);

    const project = { id: "proj-1", organizationId: "org-1", name: "Project 1", status: "ACTIVE", createdAt: new Date(), updatedAt: new Date() };
    mockStore.projects.push(project);

    const contract = {
      id: "contract-1",
      organizationId: "org-1",
      projectId: "proj-1",
      agentId: "agent-1",
      name: "Contract 1",
      version: 1,
      objective: "Contract objective",
      inputs: {},
      successCriteria: [],
      allowedTools: ["database_query"],
      requiredApprovals: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    mockStore.taskContracts.push(contract);
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

  const createApiKeyWithScopes = async (scopes: string[]) => {
    const cookie = getSessionCookie("user-1", "org-1");
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/api-keys",
      headers: { cookie },
      payload: {
        name: `Key with scopes: ${scopes.join(", ")}`,
        scopes
      }
    });

    assert.equal(res.statusCode, 200);
    const { rawKey, apiKeyRecord } = JSON.parse(res.body);
    return { rawKey, apiKeyRecord };
  };

  describe("hasScope helper unit tests", () => {
    it("evaluates exact matches correctly", () => {
      assert.equal(hasScope(["executions:read"], "executions:read"), true);
      assert.equal(hasScope(["executions:read"], "executions:write"), false);
      assert.equal(hasScope(["eval:write"], "eval:read"), false);
      assert.equal(hasScope(["eval:write"], "eval:write"), true);
    });

    it("evaluates admin / all / * superuser scopes", () => {
      assert.equal(hasScope(["all"], "executions:write"), true);
      assert.equal(hasScope(["admin"], "eval:read"), true);
      assert.equal(hasScope(["*"], "governance:read"), true);
    });

    it("evaluates resource wildcards (e.g. executions:*)", () => {
      assert.equal(hasScope(["executions:*"], "executions:read"), true);
      assert.equal(hasScope(["executions:*"], "executions:write"), true);
      assert.equal(hasScope(["executions:*"], "eval:read"), false);
    });

    it("handles undefined, null, or empty scopes gracefully", () => {
      assert.equal(hasScope(undefined, "executions:read"), false);
      assert.equal(hasScope([], "executions:read"), false);
    });
  });

  describe("Route Integration Scope Enforcement", () => {
    it("confirms a key with only executions:read scope gets 403 on a write route (POST /executions)", async () => {
      const { rawKey } = await createApiKeyWithScopes(["executions:read"]);

      const writeRes = await app.inject({
        method: "POST",
        url: "/api/v1/executions",
        headers: { authorization: `Bearer ${rawKey}` },
        payload: {
          projectId: "proj-1",
          agentId: "agent-1",
          objective: "Attempt unauthorized write"
        }
      });

      assert.equal(writeRes.statusCode, 403);
      const body = JSON.parse(writeRes.body);
      assert.equal(body.error.code, "FORBIDDEN");
      assert.match(body.error.message, /Insufficient API key scope/i);
      assert.match(body.error.message, /executions:write/i);
    });

    it("confirms a key with only executions:read scope gets 403 on tool trace write (POST /tool-call-traces)", async () => {
      const { rawKey } = await createApiKeyWithScopes(["executions:read"]);

      const traceRes = await app.inject({
        method: "POST",
        url: "/api/v1/tool-call-traces",
        headers: { authorization: `Bearer ${rawKey}` },
        payload: {
          executionId: "exec-1",
          agentId: "agent-1",
          toolName: "database_query",
          input: { query: "SELECT 1" }
        }
      });

      assert.equal(traceRes.statusCode, 403);
      const body = JSON.parse(traceRes.body);
      assert.equal(body.error.code, "FORBIDDEN");
      assert.match(body.error.message, /Insufficient API key scope/i);
    });

    it("confirms a key with only executions:read scope successfully accesses read route (GET /executions)", async () => {
      const { rawKey } = await createApiKeyWithScopes(["executions:read"]);

      const readRes = await app.inject({
        method: "GET",
        url: "/api/v1/executions",
        headers: { authorization: `Bearer ${rawKey}` }
      });

      assert.equal(readRes.statusCode, 200);
      const body = JSON.parse(readRes.body);
      assert.ok(Array.isArray(body));
    });

    it("confirms a key with executions:write scope successfully creates an execution", async () => {
      const { rawKey } = await createApiKeyWithScopes(["executions:write"]);

      const writeRes = await app.inject({
        method: "POST",
        url: "/api/v1/executions",
        headers: { authorization: `Bearer ${rawKey}` },
        payload: {
          projectId: "proj-1",
          agentId: "agent-1",
          objective: "Authorized execution write"
        }
      });

      assert.equal(writeRes.statusCode, 201);
      const body = JSON.parse(writeRes.body);
      assert.equal(body.objective, "Authorized execution write");
      assert.equal(body.status, "QUEUED");
    });

    it("confirms a key with only eval:read gets 403 on POST /eval-runs but 200 on GET /eval-runs", async () => {
      const { rawKey } = await createApiKeyWithScopes(["eval:read"]);

      // Read succeeds
      const readRes = await app.inject({
        method: "GET",
        url: "/api/v1/eval-runs",
        headers: { authorization: `Bearer ${rawKey}` }
      });
      assert.equal(readRes.statusCode, 200);

      // Write fails with 403
      const writeRes = await app.inject({
        method: "POST",
        url: "/api/v1/eval-runs",
        headers: { authorization: `Bearer ${rawKey}` },
        payload: {
          projectId: "proj-1",
          name: "Eval Run 1",
          contractId: "contract-1"
        }
      });
      assert.equal(writeRes.statusCode, 403);
      const body = JSON.parse(writeRes.body);
      assert.equal(body.error.code, "FORBIDDEN");
      assert.match(body.error.message, /eval:write/i);
    });

    it("confirms a key with 'all' or 'admin' scope has access to read and write routes", async () => {
      const { rawKey } = await createApiKeyWithScopes(["all"]);

      // Can read executions
      const readRes = await app.inject({
        method: "GET",
        url: "/api/v1/executions",
        headers: { authorization: `Bearer ${rawKey}` }
      });
      assert.equal(readRes.statusCode, 200);

      // Can write executions
      const writeRes = await app.inject({
        method: "POST",
        url: "/api/v1/executions",
        headers: { authorization: `Bearer ${rawKey}` },
        payload: {
          projectId: "proj-1",
          agentId: "agent-1",
          objective: "Superuser execution"
        }
      });
      assert.equal(writeRes.statusCode, 201);
    });

    it("confirms session-authenticated human users are unaffected by API key scope restrictions", async () => {
      const cookie = getSessionCookie("user-1", "org-1");

      // User session can call read
      const readRes = await app.inject({
        method: "GET",
        url: "/api/v1/executions",
        headers: { cookie }
      });
      assert.equal(readRes.statusCode, 200);

      // User session can call write
      const writeRes = await app.inject({
        method: "POST",
        url: "/api/v1/executions",
        headers: { cookie },
        payload: {
          projectId: "proj-1",
          agentId: "agent-1",
          objective: "Human user session write"
        }
      });
      assert.equal(writeRes.statusCode, 201);
    });
  });
});
