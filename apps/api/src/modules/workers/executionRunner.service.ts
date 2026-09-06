import crypto from "node:crypto";
import type { PrismaClient, AgentExecutionStatus } from "@agentready/db";
import { assertExecutionTransition } from "../agent-executions/executionStateMachine.js";
import type { AuditService } from "../audit/auditService.js";

export type RunnerHttpClient = (url: string, init: RequestInit) => Promise<Response>;

export class ExecutionRunnerService {
  private isRunning = false;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private readonly intervalMs = 5000;

  constructor(
    private readonly prisma: PrismaClient,
    private readonly auditService: AuditService,
    private readonly httpClient: RunnerHttpClient = globalThis.fetch
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
          if (process.env.NODE_ENV === "production") {
            const failureReason = "CONFIG_ERROR: AGENT_RUNNER_WEBHOOK_URL is not configured";
            await this.prisma.agentExecution.update({
              where: { id: exec.id },
              data: {
                status: "FAILED",
                failureReason,
                completedAt: new Date(),
                output: {
                  error:
                    "AGENT_RUNNER_WEBHOOK_URL is required to dispatch executions in production, but is not configured in the environment."
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
                  "Missing AGENT_RUNNER_WEBHOOK_URL environment variable in production"
              }
            });
            continue;
          }

          // In non-production environments with AGENT_RUNNER_WEBHOOK_URL unset:
          // Execute the local agent runner which adheres strictly to the governance protocol
          // by calling the real POST /tool-calls/check and POST /tool-calls/:traceId/result endpoints.
          const contract = exec.contractId
            ? await this.prisma.taskContract.findUnique({ where: { id: exec.contractId } })
            : null;

          try {
            await this.runLocalAgent(exec, contract);
          } catch (localRunnerErr: any) {
            await this.prisma.agentExecution.update({
              where: { id: exec.id },
              data: {
                status: "FAILED",
                failureReason: "RUNNER_ERROR",
                completedAt: new Date(),
                output: { error: localRunnerErr.message }
              }
            });
            await this.auditService.record({
              organizationId: exec.organizationId,
              source: "SYSTEM",
              action: "agent_execution.runner_failed",
              resourceType: "AgentExecution",
              resourceId: exec.id,
              before: { status: "RUNNING" },
              after: { status: "FAILED", failureReason: "RUNNER_ERROR" },
              metadata: { error: localRunnerErr.message }
            });
          }
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

  private async runLocalAgent(exec: any, contract: any): Promise<void> {
    const rawKey = `ar_live_local_${crypto.randomBytes(16).toString("hex")}`;
    const keyHash = crypto.createHash("sha256").update(rawKey).digest("hex");

    await this.prisma.apiKey.create({
      data: {
        organizationId: exec.organizationId,
        agentId: exec.agentId,
        name: "Local Agent Runner Key",
        keyPrefix: rawKey.slice(0, 12),
        keyHash,
        scopes: ["tool_calls:check", "tool_calls:result", "executions:write", "executions:read"],
        expiresAt: new Date(Date.now() + 120000)
      }
    });

    try {
      const apiBaseUrl = (process.env.AGENTREADY_API_URL || `http://127.0.0.1:${process.env.PORT || 3001}`).replace(/\/+$/, "");

      // Determine tools to execute from contract or input
      const toolsToRun: string[] =
        Array.isArray(contract?.allowedTools) && contract.allowedTools.length > 0
          ? (contract.allowedTools as string[])
          : Array.isArray((exec.input as any)?.tools)
          ? ((exec.input as any).tools as string[])
          : ["system_inspection"];

      let isWaitingApproval = false;

      for (let i = 0; i < toolsToRun.length; i++) {
        const toolName = toolsToRun[i];
        const isLastTool = i === toolsToRun.length - 1;

        // 1. Call real POST /api/v1/executions/:id/tool-calls/check
        const checkUrl = `${apiBaseUrl}/api/v1/executions/${exec.id}/tool-calls/check`;
        const checkRes = await this.httpClient(checkUrl, {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${rawKey}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            toolName,
            arguments: {
              objective: exec.objective,
              step: i + 1
            }
          })
        });

        if (!checkRes.ok) {
          const errText = await checkRes.text().catch(() => "");
          throw new Error(`Tool check failed for '${toolName}' with HTTP ${checkRes.status}: ${errText}`);
        }

        const checkData = (await checkRes.json()) as {
          decision: "ALLOW" | "BLOCK" | "WAIT_FOR_APPROVAL";
          reason: string;
          toolCallTraceId?: string;
          approvalRequestId?: string;
        };

        if (checkData.decision === "WAIT_FOR_APPROVAL") {
          // Execution entered human approval gate; leave in WAITING_APPROVAL
          isWaitingApproval = true;
          break;
        }

        if (checkData.decision === "BLOCK") {
          throw new Error(`Tool '${toolName}' was blocked by governance policy: ${checkData.reason}`);
        }

        // 2. Call real POST /api/v1/tool-calls/:traceId/result
        if (checkData.toolCallTraceId) {
          const resultUrl = `${apiBaseUrl}/api/v1/tool-calls/${checkData.toolCallTraceId}/result`;
          const resultRes = await this.httpClient(resultUrl, {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${rawKey}`,
              "Content-Type": "application/json"
            },
            body: JSON.stringify({
              status: "SUCCEEDED",
              output: {
                tool: toolName,
                status: "success",
                message: `Local runner completed ${toolName}`
              },
              latencyMs: 15,
              isFinalAction: isLastTool
            })
          });

          if (!resultRes.ok) {
            const errText = await resultRes.text().catch(() => "");
            throw new Error(`Tool result reporting failed for '${toolName}' with HTTP ${resultRes.status}: ${errText}`);
          }
        }
      }

      // If not waiting for approval and still RUNNING, transition to SUCCEEDED
      if (!isWaitingApproval) {
        const current = await this.prisma.agentExecution.findUnique({ where: { id: exec.id } });
        if (current && current.status === "RUNNING") {
          await this.prisma.agentExecution.update({
            where: { id: exec.id },
            data: {
              status: "SUCCEEDED",
              completedAt: new Date(),
              output: { message: "Local runner execution completed successfully" }
            }
          });
        }
      }
    } finally {
      // Clean up ephemeral key
      await this.prisma.apiKey.deleteMany({
        where: { keyHash }
      }).catch(() => {});
    }
  }
}
