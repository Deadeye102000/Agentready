import type { PrismaClient, AgentExecutionStatus } from "@agentready/db";
import { assertExecutionTransition } from "../agent-executions/executionStateMachine.js";
import type { AuditService } from "../audit/auditService.js";

export class ExecutionRunnerService {
  private isRunning = false;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private readonly intervalMs = 5000;

  constructor(
    private readonly prisma: PrismaClient,
    private readonly auditService: AuditService
  ) {}

  start() {
    if (this.isRunning) return;
    this.isRunning = true;
    this.scheduleNextPoll();
  }

  stop() {
    this.isRunning = false;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  private scheduleNextPoll() {
    if (!this.isRunning) return;
    this.timer = setTimeout(() => {
      this.poll()
        .catch((err) => {
          console.error(`[Worker] Unhandled error during poll: ${err.message}`);
        })
        .finally(() => {
          this.scheduleNextPoll();
        });
    }, this.intervalMs);
  }

  async poll(): Promise<void> {
    // 1. Fetch a small batch of QUEUED executions ordered by createdAt ascending
    const queuedExecutions = await this.prisma.agentExecution.findMany({
      where: { status: "QUEUED" },
      orderBy: { createdAt: "asc" },
      take: 5
    });

    for (const exec of queuedExecutions) {
      // If loop was stopped mid-batch, break early
      if (!this.isRunning) break;

      try {
        // 2. Strict State Machine Enforcement: Transition validation check
        assertExecutionTransition(exec.status as AgentExecutionStatus, "RUNNING");

        // 3. Atomic database update to claim the execution
        const result = await this.prisma.agentExecution.updateMany({
          where: {
            id: exec.id,
            status: "QUEUED"
          },
          data: {
            status: "RUNNING",
            startedAt: new Date(),
            attemptCount: (exec.attemptCount ?? 0) + 1
          }
        });

        // Skip if another worker claimed it first
        if (result.count === 0) {
          continue;
        }

        // 4. SYSTEM Actor Auditing: Transition MUST be logged in AuditLog as SYSTEM actor
        await this.auditService.record({
          organizationId: exec.organizationId,
          source: "SYSTEM",
          action: "agent_execution.started",
          resourceType: "AgentExecution",
          resourceId: exec.id,
          before: { status: "QUEUED" },
          after: { status: "RUNNING", attemptCount: (exec.attemptCount ?? 0) + 1 },
          metadata: {
            actorId: "background-runner",
            reason: "Execution claimed by async background runner"
          }
        });

        // 5. Stub the actual agent execution
        // TODO: Invoke Agent Execution Harness here

      } catch (err: any) {
        console.error(`[Worker] Error processing execution ${exec.id}: ${err.message}`);
      }
    }
  }
}
