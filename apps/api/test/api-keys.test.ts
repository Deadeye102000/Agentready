import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { buildServer } from "../src/server.js";
import { mockStore, resetMockStore } from "./mockPrisma.js";
import { signSession } from "@agentready/auth";
import { env } from "../src/lib/env.js";
import { requireMachineAuth } from "../src/modules/auth/machineAuthPlugin.js";

describe("API Key Management & Machine Auth Integration Tests", () => {
  let app: any;

  beforeEach(async () => {
    resetMockStore();
    app = await buildServer();

    // Register a dummy route protected by requireMachineAuth to verify machine auth integration
    app.get("/_test/machine-auth", {
      preHandler: [requireMachineAuth]
    }, async (request: any) => {
      return {
        ok: true,
        authContext: request.authContext
      };
    });

    // Seed organization, user, and agent
    const org = { id: "org-1", name: "Test Org", slug: "test-org", createdAt: new Date(), updatedAt: new Date() };
    mockStore.organizations.push(org);

    const user = { id: "user-1", email: "user@example.com", name: "User", passwordHash: "hash", createdAt: new Date(), updatedAt: new Date() };
    mockStore.users.push(user);

    mockStore.memberships.push({
      id: "mem-1",
      userId: "user-1",
      organizationId: "org-1",
      role: "ADMIN",
      createdAt: new Date(),
      updatedAt: new Date()
    });

    const agent = { id: "agent-1", organizationId: "org-1", name: "Agent 1", createdAt: new Date(), updatedAt: new Date() };
    mockStore.agentIdentities.push(agent);
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

  it("successfully creates, lists, and revokes API keys for OWNER/ADMIN", async () => {
    const cookie = getSessionCookie("user-1", "org-1");

    // 1. Create API Key
    const createRes = await app.inject({
      method: "POST",
      url: "/api/v1/api-keys",
      headers: { cookie },
      payload: { name: "Agent Key" }
    });

    assert.equal(createRes.statusCode, 200);
    const createBody = JSON.parse(createRes.body);
    assert.ok(createBody.rawKey);
    assert.match(createBody.rawKey, /^ar_live_/);
    assert.equal(createBody.apiKeyRecord.name, "Agent Key");
    assert.ok(createBody.apiKeyRecord.id);

    const keyId = createBody.apiKeyRecord.id;

    // 2. List API Keys
    const listRes = await app.inject({
      method: "GET",
      url: "/api/v1/api-keys",
      headers: { cookie }
    });

    assert.equal(listRes.statusCode, 200);
    const listBody = JSON.parse(listRes.body);
    assert.equal(listBody.length, 1);
    assert.equal(listBody[0].id, keyId);
    assert.equal(listBody[0].name, "Agent Key");
    assert.ok(listBody[0].keyPrefix);
    // Secure hash secrets must be omitted from listing
    assert.equal(listBody[0].rawKey, undefined);
    assert.equal(listBody[0].keyHash, undefined);

    // 3. Revoke API Key
    const deleteRes = await app.inject({
      method: "DELETE",
      url: `/api/v1/api-keys/${keyId}`,
      headers: { cookie }
    });

    assert.equal(deleteRes.statusCode, 200);
    const deleteBody = JSON.parse(deleteRes.body);
    assert.ok(deleteBody.revokedAt);
  });

  it("records audit log entries on API key creation and revocation without exposing raw key or hash", async () => {
    const cookie = getSessionCookie("user-1", "org-1");

    // 1. Create API key
    const createRes = await app.inject({
      method: "POST",
      url: "/api/v1/api-keys",
      headers: { cookie },
      payload: { name: "Audit Key", scopes: ["executions:read"] }
    });

    assert.equal(createRes.statusCode, 200);
    const { apiKeyRecord, rawKey } = JSON.parse(createRes.body);

    // Verify create audit entry
    const createAudit = mockStore.auditLogs.find(
      (log) => log.action === "api_key.created" && log.targetId === apiKeyRecord.id
    );
    assert.ok(createAudit, "Expected audit log for api_key.created");
    assert.equal(createAudit.organizationId, "org-1");
    assert.equal(createAudit.actorType, "USER");
    assert.equal(createAudit.actorUserId, "user-1");
    assert.equal(createAudit.targetType, "ApiKey");
    assert.equal(createAudit.targetId, apiKeyRecord.id);
    assert.ok(createAudit.createdAt instanceof Date);

    // Ensure raw key and key hash are never stored in audit log
    const createAuditStr = JSON.stringify(createAudit);
    assert.equal(createAuditStr.includes(rawKey), false, "Raw key must never be logged");
    assert.equal(createAuditStr.includes(apiKeyRecord.keyHash), false, "Key hash must never be logged");

    // 2. Revoke API key
    const revokeRes = await app.inject({
      method: "DELETE",
      url: `/api/v1/api-keys/${apiKeyRecord.id}`,
      headers: { cookie }
    });

    assert.equal(revokeRes.statusCode, 200);

    // Verify revoke audit entry
    const revokeAudit = mockStore.auditLogs.find(
      (log) => log.action === "api_key.revoked" && log.targetId === apiKeyRecord.id
    );
    assert.ok(revokeAudit, "Expected audit log for api_key.revoked");
    assert.equal(revokeAudit.organizationId, "org-1");
    assert.equal(revokeAudit.actorType, "USER");
    assert.equal(revokeAudit.actorUserId, "user-1");
    assert.equal(revokeAudit.targetType, "ApiKey");
    assert.equal(revokeAudit.targetId, apiKeyRecord.id);
    assert.ok(revokeAudit.createdAt instanceof Date);

    const revokeAuditStr = JSON.stringify(revokeAudit);
    assert.equal(revokeAuditStr.includes(rawKey), false, "Raw key must never be logged on revoke");
    assert.equal(revokeAuditStr.includes(apiKeyRecord.keyHash), false, "Key hash must never be logged on revoke");
  });

  it("authenticates and scopes request using valid Bearer token", async () => {
    const cookie = getSessionCookie("user-1", "org-1");

    // Create a key
    const createRes = await app.inject({
      method: "POST",
      url: "/api/v1/api-keys",
      headers: { cookie },
      payload: { name: "Machine Key" }
    });
    const { rawKey } = JSON.parse(createRes.body);

    // Call dummy route with valid Bearer token
    const testRes = await app.inject({
      method: "GET",
      url: "/_test/machine-auth",
      headers: { authorization: `Bearer ${rawKey}` }
    });

    assert.equal(testRes.statusCode, 200);
    const testBody = JSON.parse(testRes.body);
    assert.equal(testBody.ok, true);
    assert.equal(testBody.authContext.actorType, "AGENT");
    assert.equal(testBody.authContext.agentId, "agent-1");
    assert.equal(testBody.authContext.organizationId, "org-1");
    assert.equal(testBody.authContext.role, undefined);
  });

  it("authenticates real V1 protected route using valid Bearer token", async () => {
    const cookie = getSessionCookie("user-1", "org-1");

    // Create an API key
    const createRes = await app.inject({
      method: "POST",
      url: "/api/v1/api-keys",
      headers: { cookie },
      payload: { name: "V1 Route Key" }
    });
    const { rawKey } = JSON.parse(createRes.body);

    // Call real protected V1 route with Bearer token
    const v1Res = await app.inject({
      method: "GET",
      url: "/api/v1/approval-gates",
      headers: { authorization: `Bearer ${rawKey}` }
    });

    assert.equal(v1Res.statusCode, 200);
    const v1Body = JSON.parse(v1Res.body);
    assert.ok(Array.isArray(v1Body));
  });

  it("denies access on real V1 protected route when neither valid cookie nor valid Bearer token is provided", async () => {
    // Call real protected V1 route without auth header or cookie
    const unauthRes = await app.inject({
      method: "GET",
      url: "/api/v1/approval-gates"
    });

    assert.equal(unauthRes.statusCode, 401);
    const unauthBody = JSON.parse(unauthRes.body);
    assert.equal(unauthBody.error.code, "UNAUTHORIZED");
    assert.equal(unauthBody.error.message, "Authentication required");
  });

  it("denies access with missing, invalid or revoked Bearer token", async () => {
    const cookie = getSessionCookie("user-1", "org-1");

    // Create a key
    const createRes = await app.inject({
      method: "POST",
      url: "/api/v1/api-keys",
      headers: { cookie },
      payload: { name: "Revoked Key" }
    });
    const { rawKey, apiKeyRecord } = JSON.parse(createRes.body);

    // Revoke the key
    await app.inject({
      method: "DELETE",
      url: `/api/v1/api-keys/${apiKeyRecord.id}`,
      headers: { cookie }
    });

    // 1. Missing Authorization header
    const missingRes = await app.inject({
      method: "GET",
      url: "/_test/machine-auth"
    });
    assert.equal(missingRes.statusCode, 401);

    // 2. Invalid Token
    const invalidRes = await app.inject({
      method: "GET",
      url: "/_test/machine-auth",
      headers: { authorization: "Bearer ar_live_invalidkeyhere" }
    });
    assert.equal(invalidRes.statusCode, 401);

    // 3. Revoked Token
    const revokedRes = await app.inject({
      method: "GET",
      url: "/_test/machine-auth",
      headers: { authorization: `Bearer ${rawKey}` }
    });
    assert.equal(revokedRes.statusCode, 401);
  });

  it("validates scopes against API_KEY_SCOPES enum and rejects invalid/mistyped scopes", async () => {
    const cookie = getSessionCookie("user-1", "org-1");

    // 1. Reject invalid/nonsensical scopes
    const invalidRes = await app.inject({
      method: "POST",
      url: "/api/v1/api-keys",
      headers: { cookie },
      payload: {
        name: "Bad Scopes Key",
        scopes: ["observability:read", "invalid:scope", "fake_scope"]
      }
    });

    assert.equal(invalidRes.statusCode, 400);

    // 2. Accept valid scopes including observability:read and audit:read
    const validRes = await app.inject({
      method: "POST",
      url: "/api/v1/api-keys",
      headers: { cookie },
      payload: {
        name: "Valid Scopes Key",
        scopes: ["observability:read", "audit:read", "executions:read"]
      }
    });

    assert.equal(validRes.statusCode, 200);
    const validBody = JSON.parse(validRes.body);
    assert.deepEqual(validBody.apiKeyRecord.scopes, ["observability:read", "audit:read", "executions:read"]);
  });
});

