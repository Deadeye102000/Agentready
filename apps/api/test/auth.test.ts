import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { buildServer } from "../src/server.js";
import { mockStore, resetMockStore } from "./mockPrisma.js";
import { hashPassword } from "@agentready/auth";

describe("Auth Integration Tests", () => {
  let app: any;

  beforeEach(async () => {
    resetMockStore();
    // Build server inside beforeEach so we get a clean Fastify instance
    app = await buildServer();
  });

  it("POST /api/v1/auth/register - successfully registers user and organization", async () => {
    const payload = {
      email: "test@example.com",
      password: "SuperSecretPassword123",
      name: "Test User",
      organizationName: "Test Org",
    };

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/auth/register",
      payload,
    });

    assert.equal(res.statusCode, 201);
    const body = JSON.parse(res.body);
    
    // Check body content
    assert.ok(body.user);
    assert.equal(body.user.email, payload.email);
    assert.equal(body.user.name, payload.name);
    assert.ok(body.organization);
    assert.equal(body.organization.name, payload.organizationName);
    assert.equal(body.role, "OWNER");

    // Check session cookie exists
    const setCookie = res.headers["set-cookie"];
    const cookieString = Array.isArray(setCookie) ? setCookie[0] : setCookie;
    assert.ok(cookieString?.includes("agentready_session="));

    // Verify user is in mock DB
    assert.equal(mockStore.users.length, 1);
    assert.equal(mockStore.users[0].email, payload.email);
    assert.equal(mockStore.organizations.length, 1);
    assert.equal(mockStore.organizations[0].name, payload.organizationName);
  });

  it("POST /api/v1/auth/login - successfully logs in with correct credentials", async () => {
    // Hash password beforehand and seed mock store
    const password = "my-password-123";
    const passwordHash = await hashPassword(password);
    
    const user = {
      id: "user-id-1",
      email: "login@example.com",
      name: "Login User",
      passwordHash,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const org = {
      id: "org-id-1",
      name: "Login Org",
      slug: "login-org",
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const membership = {
      id: "member-id-1",
      userId: user.id,
      organizationId: org.id,
      role: "MEMBER",
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    mockStore.users.push(user);
    mockStore.organizations.push(org);
    mockStore.memberships.push(membership);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: {
        email: user.email,
        password,
      },
    });

    assert.equal(res.statusCode, 200);
    const body = JSON.parse(res.body);

    assert.equal(body.user.email, user.email);
    assert.equal(body.organization.id, org.id);
    assert.equal(body.role, "MEMBER");

    const setCookie = res.headers["set-cookie"];
    const cookieString = Array.isArray(setCookie) ? setCookie[0] : setCookie;
    assert.ok(cookieString?.includes("agentready_session="));
  });

  it("POST /api/v1/auth/login - fails with invalid credentials and returns unified error payload", async () => {
    const password = "my-password-123";
    const passwordHash = await hashPassword(password);
    
    const user = {
      id: "user-id-1",
      email: "login-fail@example.com",
      name: "Login Fail User",
      passwordHash,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    mockStore.users.push(user);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: {
        email: user.email,
        password: "wrong-password",
      },
    });

    assert.equal(res.statusCode, 401);
    const body = JSON.parse(res.body);

    // Verify unified error format: { error: { code, message, details } }
    assert.ok(body.error);
    assert.equal(body.error.code, "UNAUTHORIZED");
    assert.ok(body.error.message);
    assert.ok(body.error.details);
    assert.ok(body.error.details.requestId);
  });

  it("GET /api/v1/auth/me - fails without session cookie", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/auth/me",
    });

    assert.equal(res.statusCode, 401);
    const body = JSON.parse(res.body);
    assert.equal(body.error.code, "UNAUTHORIZED");
  });

  it("GET /api/v1/auth/me - succeeds with valid session cookie", async () => {
    // Register first via route to get a real valid cookie
    const registerRes = await app.inject({
      method: "POST",
      url: "/api/v1/auth/register",
      payload: {
        email: "me@example.com",
        password: "SuperSecretPassword123",
        name: "Me User",
        organizationName: "Me Org",
      },
    });

    const setCookie = registerRes.headers["set-cookie"];
    const cookieString = Array.isArray(setCookie) ? setCookie[0] : setCookie;
    const match = cookieString?.match(/agentready_session=([^;]+)/);
    const sessionCookie = match ? `agentready_session=${match[1]}` : "";

    const res = await app.inject({
      method: "GET",
      url: "/api/v1/auth/me",
      headers: {
        cookie: sessionCookie,
      },
    });

    assert.equal(res.statusCode, 200);
    const body = JSON.parse(res.body);

    assert.equal(body.user.email, "me@example.com");
    assert.ok(body.organization.id);
    assert.equal(body.organization.name, "Me Org");
  });
});
