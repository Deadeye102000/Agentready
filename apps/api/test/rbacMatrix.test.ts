import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import crypto from "crypto";
import { buildServer } from "../src/server.js";
import { mockStore, resetMockStore } from "./mockPrisma.js";
import { signSession } from "@agentready/auth";
import { env } from "../src/lib/env.js";

describe("Comprehensive Route Authorization Matrix (RBAC, Scopes & Machine Auth)", () => {
  let app: any;
  const rawKeyExecRead = "ar_live_exec_read_only_key_123";
  const rawKeyAdmin = "ar_live_admin_super_key_123";
  const rawKeyToolResult = "ar_live_tool_result_key_123";

  beforeEach(async () => {
    resetMockStore();
    app = await buildServer();

    // 1. Seed Organization
    mockStore.organizations.push({
      id: "org-1",
      name: "Matrix Org",
      slug: "matrix-org",
      createdAt: new Date(),
      updatedAt: new Date()
    });

    // 2. Seed Project & Agent
    mockStore.projects.push({
      id: "proj-1",
      organizationId: "org-1",
      name: "Matrix Project",
      status: "ACTIVE",
      createdAt: new Date(),
      updatedAt: new Date()
    });

    mockStore.agentIdentities.push({
      id: "agent-1",
      organizationId: "org-1",
      name: "Matrix Agent",
      createdAt: new Date(),
      updatedAt: new Date()
    });

    // 3. Seed TaskContract & Execution
    mockStore.taskContracts.push({
      id: "contract-1",
      organizationId: "org-1",
      projectId: "proj-1",
      agentId: "agent-1",
      name: "Contract 1",
      version: 1,
      objective: "Matrix Contract",
      inputs: {},
      successCriteria: [],
      allowedTools: ["db_query"],
      requiredApprovals: [],
      createdAt: new Date(),
      updatedAt: new Date()
    });

    mockStore.agentExecutions.push({
      id: "exec-1",
      organizationId: "org-1",
      projectId: "proj-1",
      agentId: "agent-1",
      taskContractId: "contract-1",
      status: "RUNNING",
      objective: "Active Execution",
      input: {},
      riskScore: 0,
      createdAt: new Date(),
      updatedAt: new Date()
    });

    mockStore.toolCallTraces.push({
      id: "trace-1",
      organizationId: "org-1",
      executionId: "exec-1",
      agentId: "agent-1",
      toolName: "db_query",
      input: {},
      status: "PENDING",
      startedAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date()
    });

    // 4. Seed Users and Memberships for each SystemRole
    const roles: Array<"OWNER" | "ADMIN" | "MEMBER" | "VIEWER" | "APPROVER"> = [
      "OWNER",
      "ADMIN",
      "MEMBER",
      "VIEWER",
      "APPROVER"
    ];

    for (const role of roles) {
      const userId = `user-${role.toLowerCase()}`;
      mockStore.users.push({
        id: userId,
        email: `${role.toLowerCase()}@example.com`,
        name: `${role} User`,
        passwordHash: "hash",
        createdAt: new Date(),
        updatedAt: new Date()
      });
      mockStore.memberships.push({
        id: `mem-${role.toLowerCase()}`,
        userId,
        organizationId: "org-1",
        role,
        createdAt: new Date(),
        updatedAt: new Date()
      });
    }

    // 5. Seed Scoped API Keys
    const hashKey = (key: string) => crypto.createHash("sha256").update(key).digest("hex");

    mockStore.apiKeys.push(
      {
        id: "key-exec-read",
        organizationId: "org-1",
        agentId: "agent-1",
        name: "Exec Read Key",
        keyPrefix: "ar_live_",
        keyHash: hashKey(rawKeyExecRead),
        scopes: ["executions:read"],
        revokedAt: null,
        expiresAt: null,
        createdAt: new Date(),
        updatedAt: new Date()
      },
      {
        id: "key-admin",
        organizationId: "org-1",
        agentId: "agent-1",
        name: "Admin Machine Key",
        keyPrefix: "ar_live_",
        keyHash: hashKey(rawKeyAdmin),
        scopes: ["*"],
        revokedAt: null,
        expiresAt: null,
        createdAt: new Date(),
        updatedAt: new Date()
      },
      {
        id: "key-tool-result",
        organizationId: "org-1",
        agentId: "agent-1",
        name: "Tool Result Key",
        keyPrefix: "ar_live_",
        keyHash: hashKey(rawKeyToolResult),
        scopes: ["tool_calls:result"],
        revokedAt: null,
        expiresAt: null,
        createdAt: new Date(),
        updatedAt: new Date()
      }
    );
  });

  afterEach(async () => {
    if (app) {
      await app.close();
    }
  });

  const getSessionCookie = (role: string) => {
    const token = signSession(
      { userId: `user-${role.toLowerCase()}`, organizationId: "org-1", exp: Math.floor(Date.now() / 1000) + 3600 },
      env.AUTH_SESSION_SECRET
    );
    return `agentready_session=${token}`;
  };

  const MUTATION_ROUTES = [
    {
      name: "POST /api/v1/executions",
      method: "POST" as const,
      url: "/api/v1/executions",
      payload: { projectId: "proj-1", agentId: "agent-1", objective: "Matrix test exec" },
      requiredScope: "executions:write"
    },
    {
      name: "PATCH /api/v1/executions/:id",
      method: "PATCH" as const,
      url: "/api/v1/executions/exec-1",
      payload: { status: "SUCCEEDED" },
      requiredScope: "executions:write"
    },
    {
      name: "POST /api/v1/tool-call-traces",
      method: "POST" as const,
      url: "/api/v1/tool-call-traces",
      payload: { executionId: "exec-1", agentId: "agent-1", toolName: "db_query", input: {} },
      requiredScope: "executions:write"
    },
    {
      name: "POST /api/v1/eval-runs",
      method: "POST" as const,
      url: "/api/v1/eval-runs",
      payload: { projectId: "proj-1", name: "Eval Run Matrix", contractId: "contract-1" },
      requiredScope: "eval:write"
    },
    {
      name: "POST /api/v1/eval-suites/run",
      method: "POST" as const,
      url: "/api/v1/eval-suites/run",
      payload: { projectId: "proj-1", taskContractId: "contract-1" },
      requiredScope: "eval:write"
    }
  ];

  const ADMIN_MUTATION_ROUTES = [
    {
      name: "POST /api/v1/task-contracts",
      method: "POST" as const,
      url: "/api/v1/task-contracts",
      payload: { projectId: "proj-1", agentId: "agent-1", name: "Matrix Contract 2", objective: "Obj" }
    },
    {
      name: "PUT /api/v1/feature-flags",
      method: "PUT" as const,
      url: "/api/v1/feature-flags",
      payload: { agentId: "agent-1", capability: "file_write", state: "DISABLED" }
    },
    {
      name: "POST /api/v1/eval-cases",
      method: "POST" as const,
      url: "/api/v1/eval-cases",
      payload: { taskContractId: "contract-1", name: "Case Matrix", input: {}, expectedTools: ["db_query"] }
    }
  ];

  const READ_ROUTES = [
    { name: "GET /api/v1/executions", url: "/api/v1/executions", scope: "executions:read" },
    { name: "GET /api/v1/executions/:id", url: "/api/v1/executions/exec-1", scope: "executions:read" },
    { name: "GET /api/v1/tool-call-traces", url: "/api/v1/tool-call-traces", scope: "traces:read" },
    { name: "GET /api/v1/eval-runs", url: "/api/v1/eval-runs", scope: "eval:read" },
    { name: "GET /api/v1/task-contracts", url: "/api/v1/task-contracts", scope: "contracts:read" },
    { name: "GET /api/v1/feature-flags", url: "/api/v1/feature-flags", scope: "governance:read" },
    { name: "GET /api/v1/audit-logs", url: "/api/v1/audit-logs", scope: "audit:read" },
    { name: "GET /api/v1/observability/dashboard", url: "/api/v1/observability/dashboard", scope: "observability:read" }
  ];

  describe("1. Unauthenticated Requests", () => {
    it("rejects all protected mutation routes with 401 UNAUTHORIZED", async () => {
      for (const route of [...MUTATION_ROUTES, ...ADMIN_MUTATION_ROUTES]) {
        const res = await app.inject({
          method: route.method,
          url: route.url,
          payload: route.payload
        });
        assert.equal(res.statusCode, 401, `Unauthenticated ${route.name} should return 401`);
      }
    });

    it("rejects all protected read routes with 401 UNAUTHORIZED", async () => {
      for (const route of READ_ROUTES) {
        const res = await app.inject({
          method: "GET",
          url: route.url
        });
        assert.equal(res.statusCode, 401, `Unauthenticated ${route.name} should return 401`);
      }
    });
  });

  describe("2. VIEWER Role Immunity (Read-Only Guarantee)", () => {
    it("rejects VIEWER role on EVERY mutation route with 403 FORBIDDEN", async () => {
      const cookie = getSessionCookie("VIEWER");

      for (const route of [...MUTATION_ROUTES, ...ADMIN_MUTATION_ROUTES]) {
        const res = await app.inject({
          method: route.method,
          url: route.url,
          headers: { cookie },
          payload: route.payload
        });
        assert.equal(res.statusCode, 403, `VIEWER calling ${route.name} must get 403`);
        const body = JSON.parse(res.body);
        assert.equal(body.error.code, "FORBIDDEN");
      }
    });

    it("allows VIEWER role on ALL read routes with 200 OK", async () => {
      const cookie = getSessionCookie("VIEWER");

      for (const route of READ_ROUTES) {
        const res = await app.inject({
          method: "GET",
          url: route.url,
          headers: { cookie }
        });
        assert.equal(res.statusCode, 200, `VIEWER calling ${route.name} must get 200`);
      }
    });
  });

  describe("3. MEMBER Role (Operations Permitted, Admin Routes Denied)", () => {
    it("allows MEMBER role on operational mutation routes (200/201)", async () => {
      const cookie = getSessionCookie("MEMBER");

      for (const route of MUTATION_ROUTES) {
        const res = await app.inject({
          method: route.method,
          url: route.url,
          headers: { cookie },
          payload: route.payload
        });
        assert.ok(
          res.statusCode === 200 || res.statusCode === 201,
          `MEMBER calling ${route.name} should succeed, received ${res.statusCode}`
        );
      }
    });

    it("denies MEMBER role on admin-only routes with 403 FORBIDDEN", async () => {
      const cookie = getSessionCookie("MEMBER");

      for (const route of ADMIN_MUTATION_ROUTES) {
        const res = await app.inject({
          method: route.method,
          url: route.url,
          headers: { cookie },
          payload: route.payload
        });
        assert.equal(res.statusCode, 403, `MEMBER calling admin-only ${route.name} must get 403`);
      }
    });
  });

  describe("4. OWNER & ADMIN Full Access", () => {
    it("allows OWNER and ADMIN on all human mutation and read routes", async () => {
      for (const role of ["OWNER", "ADMIN"]) {
        const cookie = getSessionCookie(role);

        // All mutations succeed
        for (const route of [...MUTATION_ROUTES, ...ADMIN_MUTATION_ROUTES]) {
          const res = await app.inject({
            method: route.method,
            url: route.url,
            headers: { cookie },
            payload: route.payload
          });
          assert.ok(
            res.statusCode === 200 || res.statusCode === 201,
            `${role} calling ${route.name} should succeed, got ${res.statusCode}`
          );
        }

        // All reads succeed
        for (const route of READ_ROUTES) {
          const res = await app.inject({
            method: "GET",
            url: route.url,
            headers: { cookie }
          });
          assert.equal(res.statusCode, 200, `${role} calling ${route.name} should return 200`);
        }
      }
    });
  });

  describe("5. Scoped Machine API Key (executions:read ONLY)", () => {
    it("allows access to executions read endpoints", async () => {
      const auth = { authorization: `Bearer ${rawKeyExecRead}` };

      const listRes = await app.inject({
        method: "GET",
        url: "/api/v1/executions",
        headers: auth
      });
      assert.equal(listRes.statusCode, 200);

      const getRes = await app.inject({
        method: "GET",
        url: "/api/v1/executions/exec-1",
        headers: auth
      });
      assert.equal(getRes.statusCode, 200);
    });

    it("denies access with 403 to EVERY write route", async () => {
      const auth = { authorization: `Bearer ${rawKeyExecRead}` };

      for (const route of [...MUTATION_ROUTES, ...ADMIN_MUTATION_ROUTES]) {
        const res = await app.inject({
          method: route.method,
          url: route.url,
          headers: auth,
          payload: route.payload
        });
        assert.equal(
          res.statusCode,
          403,
          `API Key with only executions:read must get 403 on write route ${route.name}, got ${res.statusCode}`
        );
        const body = JSON.parse(res.body);
        assert.equal(body.error.code, "FORBIDDEN");
      }
    });

    it("denies access with 403 to EVERY read route outside its declared scope", async () => {
      const auth = { authorization: `Bearer ${rawKeyExecRead}` };

      // GET /api/v1/tool-call-traces permits ["executions:read", "traces:read"], so filter it out here
      const outsideScopeRoutes = READ_ROUTES.filter(
        (r) => r.scope !== "executions:read" && r.url !== "/api/v1/tool-call-traces"
      );

      for (const route of outsideScopeRoutes) {
        const res = await app.inject({
          method: "GET",
          url: route.url,
          headers: auth
        });
        assert.equal(
          res.statusCode,
          403,
          `API Key with only executions:read must get 403 on ${route.name} (requires ${route.scope}), got ${res.statusCode}`
        );
        const body = JSON.parse(res.body);
        assert.equal(body.error.code, "FORBIDDEN");
        assert.match(body.error.message, /Insufficient API key scope/i);
      }
    });

    it("denies access with 403 to GET /api/v1/tool-call-traces for an API key lacking both executions:read and traces:read", async () => {
      const rawKeyEval = "ar_live_eval_only_key_123";
      mockStore.apiKeys.push({
        id: "key-eval",
        organizationId: "org-1",
        agentId: "agent-1",
        name: "Eval Only Key",
        keyPrefix: "ar_live_",
        keyHash: crypto.createHash("sha256").update(rawKeyEval).digest("hex"),
        scopes: ["eval:read"],
        revokedAt: null,
        expiresAt: null,
        createdAt: new Date(),
        updatedAt: new Date()
      });

      const res = await app.inject({
        method: "GET",
        url: "/api/v1/tool-call-traces",
        headers: { authorization: `Bearer ${rawKeyEval}` }
      });
      assert.equal(res.statusCode, 403);
      const body = JSON.parse(res.body);
      assert.equal(body.error.code, "FORBIDDEN");
      assert.match(body.error.message, /Insufficient API key scope/i);
    });
  });

  describe("6. Machine-Only Boundary (POST /tool-calls/:traceId/result)", () => {
    it("rejects human sessions of ALL roles with 403 'Machine authentication required'", async () => {
      for (const role of ["OWNER", "ADMIN", "MEMBER", "VIEWER"]) {
        const cookie = getSessionCookie(role);
        const res = await app.inject({
          method: "POST",
          url: "/api/v1/tool-calls/trace-1/result",
          headers: { cookie },
          payload: { status: "SUCCEEDED", output: { result: "ok" } }
        });
        assert.equal(res.statusCode, 403, `Human role ${role} must be rejected on machine-only route`);
        const body = JSON.parse(res.body);
        assert.equal(body.error.code, "FORBIDDEN");
        assert.match(body.error.message, /Machine authentication required/i);
      }
    });

    it("rejects machine key lacking tool_calls:result scope with 403", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/tool-calls/trace-1/result",
        headers: { authorization: `Bearer ${rawKeyExecRead}` },
        payload: { status: "SUCCEEDED", output: { result: "ok" } }
      });
      assert.equal(res.statusCode, 403);
      const body = JSON.parse(res.body);
      assert.equal(body.error.code, "FORBIDDEN");
      assert.match(body.error.message, /Insufficient API key scope/i);
    });

    it("accepts machine key with tool_calls:result scope", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/tool-calls/trace-1/result",
        headers: { authorization: `Bearer ${rawKeyToolResult}` },
        payload: { status: "SUCCEEDED", output: { result: "ok" } }
      });
      assert.equal(res.statusCode, 200);
    });
  });
});
