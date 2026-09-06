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

    const execution = {
      id: "exec-1",
      organizationId: "org-1",
      projectId: "proj-1",
      agentId: "agent-1",
      taskContractId: "contract-1",
      status: "RUNNING",
      objective: "Execution 1",
      input: {},
      riskScore: 0,
      createdAt: new Date(),
      updatedAt: new Date()
    };
    mockStore.agentExecutions.push(execution);

    // Seed additional role users: VIEWER, MEMBER, OWNER
    mockStore.users.push(
      { id: "user-viewer", email: "viewer@example.com", name: "Viewer User", passwordHash: "hash", createdAt: new Date(), updatedAt: new Date() },
      { id: "user-member", email: "member@example.com", name: "Member User", passwordHash: "hash", createdAt: new Date(), updatedAt: new Date() },
      { id: "user-owner", email: "owner@example.com", name: "Owner User", passwordHash: "hash", createdAt: new Date(), updatedAt: new Date() }
    );

    mockStore.memberships.push(
      { id: "mem-viewer", userId: "user-viewer", organizationId: "org-1", role: "VIEWER", createdAt: new Date(), updatedAt: new Date() },
      { id: "mem-member", userId: "user-member", organizationId: "org-1", role: "MEMBER", createdAt: new Date(), updatedAt: new Date() },
      { id: "mem-owner", userId: "user-owner", organizationId: "org-1", role: "OWNER", createdAt: new Date(), updatedAt: new Date() }
    );
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

    it("confirms session-authenticated ADMIN user has full access to reads and writes", async () => {
      const cookie = getSessionCookie("user-1", "org-1");

      // Admin user session can call read
      const readRes = await app.inject({
        method: "GET",
        url: "/api/v1/executions",
        headers: { cookie }
      });
      assert.equal(readRes.statusCode, 200);

      // Admin user session can call write
      const writeRes = await app.inject({
        method: "POST",
        url: "/api/v1/executions",
        headers: { cookie },
        payload: {
          projectId: "proj-1",
          agentId: "agent-1",
          objective: "Admin user session write"
        }
      });
      assert.equal(writeRes.statusCode, 201);
    });
  });

  describe("Session User Role-Based Scope Enforcement", () => {
    it("confirms a VIEWER-role session user gets 403 on POST /executions, POST /eval-suites/run, and POST /tool-call-traces", async () => {
      const viewerCookie = getSessionCookie("user-viewer", "org-1");

      // 1. POST /executions -> 403
      const execRes = await app.inject({
        method: "POST",
        url: "/api/v1/executions",
        headers: { cookie: viewerCookie },
        payload: {
          projectId: "proj-1",
          agentId: "agent-1",
          objective: "Unauthorized VIEWER execution write"
        }
      });
      assert.equal(execRes.statusCode, 403);
      const execBody = JSON.parse(execRes.body);
      assert.equal(execBody.error.code, "FORBIDDEN");
      assert.match(execBody.error.message, /Insufficient role permissions.*executions:write/i);

      // 2. POST /eval-suites/run -> 403
      const evalSuiteRes = await app.inject({
        method: "POST",
        url: "/api/v1/eval-suites/run",
        headers: { cookie: viewerCookie },
        payload: {
          projectId: "proj-1",
          taskContractId: "contract-1"
        }
      });
      assert.equal(evalSuiteRes.statusCode, 403);
      const evalSuiteBody = JSON.parse(evalSuiteRes.body);
      assert.equal(evalSuiteBody.error.code, "FORBIDDEN");
      assert.match(evalSuiteBody.error.message, /Insufficient role permissions.*eval:write/i);

      // 3. POST /tool-call-traces -> 403
      const traceRes = await app.inject({
        method: "POST",
        url: "/api/v1/tool-call-traces",
        headers: { cookie: viewerCookie },
        payload: {
          executionId: "exec-1",
          agentId: "agent-1",
          toolName: "database_query",
          input: { query: "SELECT 1" }
        }
      });
      assert.equal(traceRes.statusCode, 403);
      const traceBody = JSON.parse(traceRes.body);
      assert.equal(traceBody.error.code, "FORBIDDEN");
      assert.match(traceBody.error.message, /Insufficient role permissions/i);
    });

    it("confirms a VIEWER-role session user gets 200 on read routes (GET /executions, GET /tool-call-traces, GET /eval-runs)", async () => {
      const viewerCookie = getSessionCookie("user-viewer", "org-1");

      const execRead = await app.inject({
        method: "GET",
        url: "/api/v1/executions",
        headers: { cookie: viewerCookie }
      });
      assert.equal(execRead.statusCode, 200);

      const traceRead = await app.inject({
        method: "GET",
        url: "/api/v1/tool-call-traces",
        headers: { cookie: viewerCookie }
      });
      assert.equal(traceRead.statusCode, 200);

      const evalRead = await app.inject({
        method: "GET",
        url: "/api/v1/eval-runs",
        headers: { cookie: viewerCookie }
      });
      assert.equal(evalRead.statusCode, 200);
    });

    it("confirms a MEMBER-role session user can execute writes (POST /executions, POST /tool-call-traces)", async () => {
      const memberCookie = getSessionCookie("user-member", "org-1");

      // Write execution
      const execRes = await app.inject({
        method: "POST",
        url: "/api/v1/executions",
        headers: { cookie: memberCookie },
        payload: {
          projectId: "proj-1",
          agentId: "agent-1",
          objective: "Authorized MEMBER execution write"
        }
      });
      assert.equal(execRes.statusCode, 201);
      const execBody = JSON.parse(execRes.body);

      // Write tool call trace
      const traceRes = await app.inject({
        method: "POST",
        url: "/api/v1/tool-call-traces",
        headers: { cookie: memberCookie },
        payload: {
          executionId: execBody.id,
          agentId: "agent-1",
          toolName: "database_query",
          input: { query: "SELECT 1" }
        }
      });
      assert.equal(traceRes.statusCode, 201);
    });

    it("confirms OWNER and ADMIN retain full access to writes and reads under wildcard scope resolution", async () => {
      const ownerCookie = getSessionCookie("user-owner", "org-1");
      const adminCookie = getSessionCookie("user-1", "org-1");

      for (const [roleName, cookie] of [["OWNER", ownerCookie], ["ADMIN", adminCookie]]) {
        // Read executions
        const execRead = await app.inject({
          method: "GET",
          url: "/api/v1/executions",
          headers: { cookie }
        });
        assert.equal(execRead.statusCode, 200, `${roleName} should be able to read executions`);

        // Write execution
        const execWrite = await app.inject({
          method: "POST",
          url: "/api/v1/executions",
          headers: { cookie },
          payload: {
            projectId: "proj-1",
            agentId: "agent-1",
            objective: `${roleName} wildcard write`
          }
        });
        assert.equal(execWrite.statusCode, 201, `${roleName} should be able to write executions`);
        const createdExec = JSON.parse(execWrite.body);

        // Read traces
        const traceRead = await app.inject({
          method: "GET",
          url: "/api/v1/tool-call-traces",
          headers: { cookie }
        });
        assert.equal(traceRead.statusCode, 200, `${roleName} should be able to read traces`);

        // Write trace
        const traceWrite = await app.inject({
          method: "POST",
          url: "/api/v1/tool-call-traces",
          headers: { cookie },
          payload: {
            executionId: createdExec.id,
            agentId: "agent-1",
            toolName: "database_query",
            input: { query: "SELECT 1" }
          }
        });
        assert.equal(traceWrite.statusCode, 201, `${roleName} should be able to write traces`);

        // Read eval runs
        const evalRead = await app.inject({
          method: "GET",
          url: "/api/v1/eval-runs",
          headers: { cookie }
        });
        assert.equal(evalRead.statusCode, 200, `${roleName} should be able to read eval runs`);

        // Write eval run
        const evalWrite = await app.inject({
          method: "POST",
          url: "/api/v1/eval-runs",
          headers: { cookie },
          payload: {
            projectId: "proj-1",
            name: `${roleName} Eval Run`,
            contractId: "contract-1"
          }
        });
        assert.equal(evalWrite.statusCode, 201, `${roleName} should be able to write eval runs`);
      }
    });

    it("confirms role demotion from ADMIN to VIEWER takes effect immediately on next request with same session cookie", async () => {
      const cookie = getSessionCookie("user-1", "org-1");

      // Initially ADMIN: write succeeds
      const initialWrite = await app.inject({
        method: "POST",
        url: "/api/v1/executions",
        headers: { cookie },
        payload: {
          projectId: "proj-1",
          agentId: "agent-1",
          objective: "Admin write before demotion"
        }
      });
      assert.equal(initialWrite.statusCode, 201);

      // Demote user-1 from ADMIN to VIEWER in database
      const membership = mockStore.memberships.find(
        (m) => m.userId === "user-1" && m.organizationId === "org-1"
      );
      assert.ok(membership);
      membership.role = "VIEWER";

      // With the exact same session cookie, next write request immediately gets 403
      const demotedWrite = await app.inject({
        method: "POST",
        url: "/api/v1/executions",
        headers: { cookie },
        payload: {
          projectId: "proj-1",
          agentId: "agent-1",
          objective: "Demoted write attempt"
        }
      });
      assert.equal(demotedWrite.statusCode, 403);
      const demotedBody = JSON.parse(demotedWrite.body);
      assert.equal(demotedBody.error.code, "FORBIDDEN");
      assert.match(demotedBody.error.message, /Insufficient role permissions.*executions:write/i);

      // Read route still works for VIEWER with same cookie
      const demotedRead = await app.inject({
        method: "GET",
        url: "/api/v1/executions",
        headers: { cookie }
      });
      assert.equal(demotedRead.statusCode, 200);
    });

    it("confirms membership removal immediately invalidates session auth on next request", async () => {
      const cookie = getSessionCookie("user-viewer", "org-1");

      // Verify active session works for read
      const initialRead = await app.inject({
        method: "GET",
        url: "/api/v1/executions",
        headers: { cookie }
      });
      assert.equal(initialRead.statusCode, 200);

      // Remove membership from organization in database
      const memIndex = mockStore.memberships.findIndex(
        (m) => m.userId === "user-viewer" && m.organizationId === "org-1"
      );
      assert.ok(memIndex !== -1);
      mockStore.memberships.splice(memIndex, 1);

      // Next request with same cookie immediately gets 401 Unauthorized
      const revokedReq = await app.inject({
        method: "GET",
        url: "/api/v1/executions",
        headers: { cookie }
      });
      assert.equal(revokedReq.statusCode, 401);
      const revokedBody = JSON.parse(revokedReq.body);
      assert.equal(revokedBody.error.code, "UNAUTHORIZED");
    });
  });
});
