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

        // 5. Invoke Agent Execution Harness / Webhook
        const rawWebhookUrl = process.env.AGENT_RUNNER_WEBHOOK_URL;
        const webhookUrl = rawWebhookUrl && rawWebhookUrl.trim() !== "" ? rawWebhookUrl.trim() : undefined;

        if (!webhookUrl) {
          // In all environments (production, development, test), a missing webhook URL
          // must fail the execution immediately and loudly with a clear configuration error
          // rather than hanging in RUNNING state indefinitely.
          const failureReason = "CONFIG_ERROR: AGENT_RUNNER_WEBHOOK_URL is not configured";
          await this.prisma.agentExecution.update({
            where: { id: exec.id },
            data: {
              status: "FAILED",
              failureReason,
              completedAt: new Date(),
              output: {
                error:
                  "AGENT_RUNNER_WEBHOOK_URL is required to dispatch executions, but is not configured in the environment."
              }
            }
          });
          await this.auditService.record({
            organizationId: exec.organizationId,
            source: "SYSTEM",
            action: "agent_execution.runner_failed",
            resourceType: "AgentExecution",
            resourceId: exec.id,
            before: { status: "RUNNING" },
            after: { status: "FAILED", failureReason },
            metadata: {
              error:
                "Missing AGENT_RUNNER_WEBHOOK_URL environment variable across all environments"
            }
          });
          continue;
        }

        const contract = exec.contractId
            ? await this.prisma.taskContract.findUnique({ where: { id: exec.contractId } })
            : null;

          const controller = new AbortController();
          const timeoutMs = exec.timeoutMs ?? 30000;
          const timer = setTimeout(() => controller.abort(), timeoutMs);

          try {
            const resp = await fetch(webhookUrl, {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({
                executionId: exec.id,
                organizationId: exec.organizationId,
                agentId: exec.agentId,
                objective: exec.objective,
                input: exec.input,
                contract: contract
                  ? {
                      name: contract.name,
                      version: contract.version,
                      allowedTools: contract.allowedTools,
                      successCriteria: contract.successCriteria
                    }
                  : null
              }),
              signal: controller.signal
            });

            clearTimeout(timer);

            if (!resp.ok) {
              const errText = await resp.text().catch(() => "");
              await this.prisma.agentExecution.update({
                where: { id: exec.id },
                data: {
                  status: "FAILED",
                  failureReason: "RUNNER_ERROR",
                  completedAt: new Date(),
                  output: { error: `Webhook returned HTTP ${resp.status}: ${errText}` }
                }
              });
            } else {
              const resData = (await resp.json().catch(() => ({}))) as any;
              if (resData.status === "FAILED") {
                await this.prisma.agentExecution.update({
                  where: { id: exec.id },
                  data: {
                    status: "FAILED",
                    failureReason: "RUNNER_ERROR",
                    completedAt: new Date(),
                    output: resData.output ?? { error: resData.error }
                  }
                });
              } else if (resData.status === "SUCCEEDED") {
                await this.prisma.agentExecution.update({
                  where: { id: exec.id },
                  data: {
                    status: "SUCCEEDED",
                    completedAt: new Date(),
                    output: resData.output ?? {}
                  }
                });
              }
            }
          } catch (webhookErr: any) {
            clearTimeout(timer);
            const isTimeout = webhookErr.name === "AbortError";
            await this.prisma.agentExecution.update({
              where: { id: exec.id },
              data: {
                status: "FAILED",
                failureReason: isTimeout ? "TIMEOUT" : "RUNNER_ERROR",
                timedOutAt: isTimeout ? new Date() : null,
                completedAt: new Date(),
                output: { error: webhookErr.message }
              }
            });
          }

        } catch (err: any) {
        console.error(`[Worker] Error processing execution ${exec.id}: ${err.message}`);
      }
    }
  }
}
