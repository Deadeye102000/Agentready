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

  it("poller claims QUEUED executions, transitions to RUNNING, and logs SYSTEM audit", async () => {
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

    // Check execution was transitioned to RUNNING
    const updatedExec = mockStore.agentExecutions.find(e => e.id === "exec-queued-1");
    assert.ok(updatedExec);
    assert.equal(updatedExec.status, "RUNNING");
    assert.equal(updatedExec.attemptCount, 1);

    // Verify audit log has SYSTEM actor type and correct action
    const log = mockStore.auditLogs.find(l => l.targetId === "exec-queued-1");
    assert.ok(log);
    assert.equal(log.actorType, "SYSTEM");
    assert.equal(log.action, "agent_execution.started");
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
