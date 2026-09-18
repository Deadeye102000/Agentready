import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { buildServer } from "../src/server.js";
import { mockStore, resetMockStore } from "./mockPrisma.js";
import { assertExecutionTransition } from "../src/modules/agent-executions/executionStateMachine.js";
import { signSession } from "@agentready/auth";
import { env } from "../src/lib/env.js";

describe("Execution State Machine Tests", () => {
  let app: any;
  let cookieA: string;

  beforeEach(async () => {
    resetMockStore();
    app = await buildServer();

    // Seed organization, user, and membership
    const orgAlpha = { id: "org-alpha", name: "Org Alpha", slug: "org-alpha", createdAt: new Date(), updatedAt: new Date() };
    mockStore.organizations.push(orgAlpha);

    const userA = { id: "user-a", email: "user-a@example.com", name: "User A", passwordHash: "hashA", createdAt: new Date(), updatedAt: new Date() };
    mockStore.users.push(userA);

    mockStore.memberships.push({
      id: "mem-a",
      userId: "user-a",
      organizationId: "org-alpha",
      role: "OWNER",
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const tokenA = signSession(
      { userId: "user-a", organizationId: "org-alpha", exp: Math.floor(Date.now() / 1000) + 3600 },
      env.AUTH_SESSION_SECRET
    );
    cookieA = `agentready_session=${tokenA}`;
  });

  describe("Unit Tests: assertExecutionTransition", () => {
    it("allows valid transitions from QUEUED", () => {
      assert.doesNotThrow(() => assertExecutionTransition("QUEUED", "RUNNING"));
      assert.doesNotThrow(() => assertExecutionTransition("QUEUED", "CANCELLED"));
    });

    it("allows valid transitions from RUNNING", () => {
      assert.doesNotThrow(() => assertExecutionTransition("RUNNING", "WAITING_FOR_APPROVAL"));
      assert.doesNotThrow(() => assertExecutionTransition("RUNNING", "SUCCEEDED"));
      assert.doesNotThrow(() => assertExecutionTransition("RUNNING", "FAILED"));
      assert.doesNotThrow(() => assertExecutionTransition("RUNNING", "CANCELLED"));
    });

    it("allows valid transitions from WAITING_FOR_APPROVAL", () => {
      assert.doesNotThrow(() => assertExecutionTransition("WAITING_FOR_APPROVAL", "RUNNING"));
      assert.doesNotThrow(() => assertExecutionTransition("WAITING_FOR_APPROVAL", "SUCCEEDED"));
      assert.doesNotThrow(() => assertExecutionTransition("WAITING_FOR_APPROVAL", "FAILED"));
      assert.doesNotThrow(() => assertExecutionTransition("WAITING_FOR_APPROVAL", "CANCELLED"));
    });

    it("rejects invalid transitions from QUEUED", () => {
      assert.throws(() => assertExecutionTransition("QUEUED", "SUCCEEDED"), /Cannot transition agent execution from QUEUED to SUCCEEDED/);
      assert.throws(() => assertExecutionTransition("QUEUED", "FAILED"), /Cannot transition agent execution from QUEUED to FAILED/);
      assert.throws(() => assertExecutionTransition("QUEUED", "WAITING_FOR_APPROVAL"), /Cannot transition agent execution from QUEUED to WAITING_FOR_APPROVAL/);
    });

    it("rejects any transitions from terminal state SUCCEEDED", () => {
      assert.throws(() => assertExecutionTransition("SUCCEEDED", "QUEUED"), /Cannot transition agent execution from SUCCEEDED to QUEUED/);
      assert.throws(() => assertExecutionTransition("SUCCEEDED", "RUNNING"), /Cannot transition agent execution from SUCCEEDED to RUNNING/);
      assert.throws(() => assertExecutionTransition("SUCCEEDED", "WAITING_FOR_APPROVAL"), /Cannot transition agent execution from SUCCEEDED to WAITING_FOR_APPROVAL/);
      assert.throws(() => assertExecutionTransition("SUCCEEDED", "FAILED"), /Cannot transition agent execution from SUCCEEDED to FAILED/);
      assert.throws(() => assertExecutionTransition("SUCCEEDED", "CANCELLED"), /Cannot transition agent execution from SUCCEEDED to CANCELLED/);
    });

    it("rejects any transitions from terminal state FAILED", () => {
      assert.throws(() => assertExecutionTransition("FAILED", "QUEUED"), /Cannot transition agent execution from FAILED to QUEUED/);
      assert.throws(() => assertExecutionTransition("FAILED", "RUNNING"), /Cannot transition agent execution from FAILED to RUNNING/);
      assert.throws(() => assertExecutionTransition("FAILED", "WAITING_FOR_APPROVAL"), /Cannot transition agent execution from FAILED to WAITING_FOR_APPROVAL/);
      assert.throws(() => assertExecutionTransition("FAILED", "SUCCEEDED"), /Cannot transition agent execution from FAILED to SUCCEEDED/);
      assert.throws(() => assertExecutionTransition("FAILED", "CANCELLED"), /Cannot transition agent execution from FAILED to CANCELLED/);
    });

    it("rejects any transitions from terminal state CANCELLED", () => {
      assert.throws(() => assertExecutionTransition("CANCELLED", "QUEUED"), /Cannot transition agent execution from CANCELLED to QUEUED/);
      assert.throws(() => assertExecutionTransition("CANCELLED", "RUNNING"), /Cannot transition agent execution from CANCELLED to RUNNING/);
      assert.throws(() => assertExecutionTransition("CANCELLED", "WAITING_FOR_APPROVAL"), /Cannot transition agent execution from CANCELLED to WAITING_FOR_APPROVAL/);
      assert.throws(() => assertExecutionTransition("CANCELLED", "SUCCEEDED"), /Cannot transition agent execution from CANCELLED to SUCCEEDED/);
      assert.throws(() => assertExecutionTransition("CANCELLED", "FAILED"), /Cannot transition agent execution from CANCELLED to FAILED/);
    });

    it("no-op for transition to same state (self transitions)", () => {
      assert.doesNotThrow(() => assertExecutionTransition("QUEUED", "QUEUED"));
      assert.doesNotThrow(() => assertExecutionTransition("RUNNING", "RUNNING"));
      assert.doesNotThrow(() => assertExecutionTransition("WAITING_FOR_APPROVAL", "WAITING_FOR_APPROVAL"));
      assert.doesNotThrow(() => assertExecutionTransition("SUCCEEDED", "SUCCEEDED"));
      assert.doesNotThrow(() => assertExecutionTransition("FAILED", "FAILED"));
      assert.doesNotThrow(() => assertExecutionTransition("CANCELLED", "CANCELLED"));
    });
  });

  describe("Integration Tests: PATCH /executions/:id", () => {
    it("successfully performs a valid transition sequence", async () => {
      // Seed QUEUED execution
      const exec = {
        id: "exec-1",
        organizationId: "org-alpha",
        projectId: "proj-1",
        agentId: "agent-1",
        status: "QUEUED",
        objective: "Test objective",
        input: {},
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      mockStore.agentExecutions.push(exec);

      // 1. Transition: QUEUED -> RUNNING
      let res = await app.inject({
        method: "PATCH",
        url: "/api/v1/executions/exec-1",
        headers: { cookie: cookieA },
        payload: { status: "RUNNING" },
      });
      assert.equal(res.statusCode, 200);
      assert.equal(mockStore.agentExecutions[0].status, "RUNNING");

      // 2. Transition: RUNNING -> WAITING_FOR_APPROVAL
      res = await app.inject({
        method: "PATCH",
        url: "/api/v1/executions/exec-1",
        headers: { cookie: cookieA },
        payload: { status: "WAITING_FOR_APPROVAL" },
      });
      assert.equal(res.statusCode, 200);
      assert.equal(mockStore.agentExecutions[0].status, "WAITING_FOR_APPROVAL");

      // 3. Transition: WAITING_FOR_APPROVAL -> SUCCEEDED
      res = await app.inject({
        method: "PATCH",
        url: "/api/v1/executions/exec-1",
        headers: { cookie: cookieA },
        payload: { status: "SUCCEEDED", output: { success: true } },
      });
      assert.equal(res.statusCode, 200);
      assert.equal(mockStore.agentExecutions[0].status, "SUCCEEDED");
      assert.deepEqual(mockStore.agentExecutions[0].output, { success: true });
    });

    it("fails with 400 Bad Request when jumping states illegally", async () => {
      // Seed QUEUED execution
      const exec = {
        id: "exec-2",
        organizationId: "org-alpha",
        projectId: "proj-1",
        agentId: "agent-1",
        status: "QUEUED",
        objective: "Test objective",
        input: {},
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      mockStore.agentExecutions.push(exec);

      // Attempt QUEUED -> SUCCEEDED directly
      const res = await app.inject({
        method: "PATCH",
        url: "/api/v1/executions/exec-2",
        headers: { cookie: cookieA },
        payload: { status: "SUCCEEDED" },
      });

      assert.equal(res.statusCode, 400);
      const body = JSON.parse(res.body);
      assert.equal(body.error.code, "VALIDATION_ERROR");
      assert.match(body.error.message, /Cannot transition agent execution/);
    });

    it("fails with 400 Bad Request when trying to modify a terminal SUCCEEDED state", async () => {
      // Seed SUCCEEDED execution
      const exec = {
        id: "exec-3",
        organizationId: "org-alpha",
        projectId: "proj-1",
        agentId: "agent-1",
        status: "SUCCEEDED",
        objective: "Test objective",
        input: {},
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      mockStore.agentExecutions.push(exec);

      // Attempt SUCCEEDED -> RUNNING
      const res = await app.inject({
        method: "PATCH",
        url: "/api/v1/executions/exec-3",
        headers: { cookie: cookieA },
        payload: { status: "RUNNING" },
      });

      assert.equal(res.statusCode, 400);
      const body = JSON.parse(res.body);
      assert.equal(body.error.code, "VALIDATION_ERROR");
      assert.match(body.error.message, /Cannot transition agent execution/);
    });
  });
});
