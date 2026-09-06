import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { buildServer } from "../src/server.js";
import { mockStore, resetMockStore } from "./mockPrisma.js";
import { ExecutionRunnerService } from "../src/modules/workers/executionRunner.service.js";
import { AuditService } from "../src/modules/audit/auditService.js";
import { AuditRepository } from "../src/modules/audit/auditRepository.js";

describe("Execution Runner Background Worker Integration Tests", () => {
  let app: any;
  let auditService: AuditService;
  let runner: ExecutionRunnerService;

  beforeEach(async () => {
    resetMockStore();
    app = await buildServer();
    auditService = new AuditService(new AuditRepository(app.prisma as any));
    runner = new ExecutionRunnerService(app.prisma as any, auditService);
    (runner as any).isRunning = true;
  });

  afterEach(async () => {
    if (app) {
      await app.close();
    }
  });

  it("poller claims QUEUED executions and immediately fails with CONFIG_ERROR when AGENT_RUNNER_WEBHOOK_URL is missing in production", async () => {
    delete process.env.AGENT_RUNNER_WEBHOOK_URL;
    process.env.NODE_ENV = "production";

    try {
      // Seed a QUEUED execution
      const exec = {
        id: "exec-queued-1",
        organizationId: "org-alpha",
        projectId: "proj-1",
        agentId: "agent-1",
        status: "QUEUED",
        objective: "Test objective",
        input: {},
        attemptCount: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      mockStore.agentExecutions.push(exec);

      // Run one iteration of poll manually
      await runner.poll();

      // Check execution was claimed and immediately failed with CONFIG_ERROR (never left hanging in RUNNING)
      const updatedExec = mockStore.agentExecutions.find(e => e.id === "exec-queued-1");
      assert.ok(updatedExec);
      assert.equal(updatedExec.status, "FAILED");
      assert.equal(updatedExec.failureReason, "CONFIG_ERROR: AGENT_RUNNER_WEBHOOK_URL is not configured");
      assert.equal(updatedExec.attemptCount, 1);

      // Verify audit logs contain both the start event and the failure event
      const startLog = mockStore.auditLogs.find(l => l.targetId === "exec-queued-1" && l.action === "agent_execution.started");
      assert.ok(startLog);
      assert.equal(startLog.actorType, "SYSTEM");

      const failLog = mockStore.auditLogs.find(l => l.targetId === "exec-queued-1" && l.action === "agent_execution.runner_failed");
      assert.ok(failLog);
      assert.equal(failLog.actorType, "SYSTEM");
      assert.equal(failLog.metadata?.after?.failureReason, "CONFIG_ERROR: AGENT_RUNNER_WEBHOOK_URL is not configured");
    } finally {
      process.env.NODE_ENV = "test";
    }
  });

  it("in development (NODE_ENV !== 'production' and AGENT_RUNNER_WEBHOOK_URL unset), poller runs local agent runner calling real /check and /result endpoints", async () => {
    delete process.env.AGENT_RUNNER_WEBHOOK_URL;
    process.env.NODE_ENV = "development";

    const httpCalls: Array<{ url: string; method: string; body: any; headers: any }> = [];
    const customHttpClient = async (url: string, init: any) => {
      const parsedBody = JSON.parse(init.body);
      httpCalls.push({
        url,
        method: init.method,
        body: parsedBody,
        headers: init.headers
      });

      if (url.includes("/tool-calls/check")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            decision: "ALLOW",
            reason: "Tool permitted",
            toolCallTraceId: "trace-local-1",
            executionStatus: "RUNNING"
          })
        } as any;
      }

      if (url.includes("/result")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            status: "SUCCEEDED",
            toolCallTraceId: "trace-local-1"
          })
        } as any;
      }

      return { ok: false, status: 404, text: async () => "Not Found" } as any;
    };

    const devRunner = new ExecutionRunnerService(app.prisma as any, auditService, customHttpClient as any);
    (devRunner as any).isRunning = true;

    // Seed task contract with allowed tools
    mockStore.taskContracts.push({
      id: "contract-dev-1",
      organizationId: "org-alpha",
      name: "Dev Contract",
      version: 1,
      allowedTools: ["code_editor"]
    });

    const exec = {
      id: "exec-local-dev-1",
      organizationId: "org-alpha",
      projectId: "proj-1",
      agentId: "agent-1",
      contractId: "contract-dev-1",
      status: "QUEUED",
      objective: "Local runner execution objective",
      input: {},
      attemptCount: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    mockStore.agentExecutions.push(exec);

    try {
      await devRunner.poll();

      // 1. Verify execution succeeded
      const updatedExec = mockStore.agentExecutions.find(e => e.id === "exec-local-dev-1");
      assert.ok(updatedExec);
      assert.equal(updatedExec.status, "SUCCEEDED");

      // 2. Verify real /check was called with ephemeral Bearer key
      assert.equal(httpCalls.length, 2);
      const checkCall = httpCalls[0];
      assert.match(checkCall.url, /\/executions\/exec-local-dev-1\/tool-calls\/check$/);
      assert.equal(checkCall.body.toolName, "code_editor");
      assert.match(checkCall.headers.Authorization, /^Bearer ar_live_local_/);

      // 3. Verify real /result was called with traceId and isFinalAction: true
      const resultCall = httpCalls[1];
      assert.match(resultCall.url, /\/tool-calls\/trace-local-1\/result$/);
      assert.equal(resultCall.body.status, "SUCCEEDED");
      assert.equal(resultCall.body.isFinalAction, true);
      assert.match(resultCall.headers.Authorization, /^Bearer ar_live_local_/);

      // 4. Verify ephemeral API key was purged after execution
      assert.equal(mockStore.apiKeys.length, 0);
    } finally {
      process.env.NODE_ENV = "test";
    }
  });

  it("poller dispatches to webhook when AGENT_RUNNER_WEBHOOK_URL is configured", async () => {
    const originalFetch = globalThis.fetch;
    process.env.AGENT_RUNNER_WEBHOOK_URL = "http://mock-runner.internal/webhook";

    let webhookPayload: any = null;
    globalThis.fetch = (async (url: any, init: any) => {
      webhookPayload = JSON.parse(init.body);
      return {
        ok: true,
        status: 200,
        json: async () => ({ status: "SUCCEEDED", output: { result: "completed successfully" } }),
      } as any;
    }) as any;

    try {
      const exec = {
        id: "exec-webhook-success",
        organizationId: "org-alpha",
        projectId: "proj-1",
        agentId: "agent-1",
        status: "QUEUED",
        objective: "Webhook dispatch test",
        input: { prompt: "run task" },
        attemptCount: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      mockStore.agentExecutions.push(exec);

      await runner.poll();

      const updatedExec = mockStore.agentExecutions.find(e => e.id === "exec-webhook-success");
      assert.ok(updatedExec);
      assert.equal(updatedExec.status, "SUCCEEDED");
      assert.deepEqual(updatedExec.output, { result: "completed successfully" });
      assert.equal(webhookPayload.executionId, "exec-webhook-success");
      assert.equal(webhookPayload.objective, "Webhook dispatch test");
    } finally {
      globalThis.fetch = originalFetch;
      delete process.env.AGENT_RUNNER_WEBHOOK_URL;
    }
  });

  it("poller does not claim non-QUEUED executions", async () => {
    // Seed WAITING_FOR_APPROVAL execution
    const exec = {
      id: "exec-waiting",
      organizationId: "org-alpha",
      projectId: "proj-1",
      agentId: "agent-1",
      status: "WAITING_FOR_APPROVAL",
      objective: "Test objective",
      input: {},
      attemptCount: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    mockStore.agentExecutions.push(exec);

    await runner.poll();

    const result = mockStore.agentExecutions.find(e => e.id === "exec-waiting");
    assert.ok(result);
    assert.equal(result.status, "WAITING_FOR_APPROVAL");
    assert.equal(result.attemptCount, 0);
  });

  it("handles atomic update claim concurrency simulation", async () => {
    // Seed a QUEUED execution
    const exec = {
      id: "exec-queued-2",
      organizationId: "org-alpha",
      projectId: "proj-1",
      agentId: "agent-1",
      status: "QUEUED",
      objective: "Test objective",
      input: {},
      attemptCount: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    mockStore.agentExecutions.push(exec);

    // Simulate updateMany returning 0 count (already claimed by another worker)
    const originalUpdateMany = app.prisma.agentExecution.updateMany;
    app.prisma.agentExecution.updateMany = async () => {
      return { count: 0 };
    };

    await runner.poll();

    // Verify it was NOT updated or logged since result count was 0
    const updatedExec = mockStore.agentExecutions.find(e => e.id === "exec-queued-2");
    assert.ok(updatedExec);
    assert.equal(updatedExec.status, "QUEUED");
    assert.equal(updatedExec.attemptCount, 0);

    const log = mockStore.auditLogs.find(l => l.targetId === "exec-queued-2");
    assert.equal(log, undefined);

    // Restore original method
    app.prisma.agentExecution.updateMany = originalUpdateMany;
  });
});
