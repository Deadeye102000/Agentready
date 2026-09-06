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

  it("poller claims QUEUED executions and immediately fails with CONFIG_ERROR when AGENT_RUNNER_WEBHOOK_URL is missing", async () => {
    delete process.env.AGENT_RUNNER_WEBHOOK_URL;

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
