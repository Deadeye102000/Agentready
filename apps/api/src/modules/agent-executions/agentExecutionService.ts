/**
 * AgentExecutionService
 *
 * Orchestrates the full agent execution lifecycle, including governance checks,
 * state transitions, tool-call trace recording, and audit logging.
 *
 * Worker-readiness boundary
 * ─────────────────────────
 * The public API is split into two conceptual layers:
 *
 *   1. "Accept" methods  — called by the API route (HTTP request context):
 *        create()          Creates a QUEUED execution record. Returns immediately.
 *
 *   2. "Execute" methods — called by the ExecutionRunner (in-process today,
 *                          a worker process tomorrow):
 *        claimForRun()     Transitions QUEUED → RUNNING, increments attemptCount.
 *        markTimedOut()    Marks a running execution as FAILED due to timeout.
 *        markFailed()      Marks an execution FAILED with a structured reason.
 *        markRetryable()   Re-queues a FAILED execution if attempts remain.
 *        listRetryable()   Returns retryable executions for a future worker.
 *
 * TODO(WORKER-READY): When extracting to apps/worker, the worker process
 * imports this service and calls claimForRun() → (agent work) → markFailed()
 * or transition(SUCCEEDED). The route layer only ever calls create().
 */

import crypto from "crypto";
import type { AgentExecutionStatus, ToolCallStatus } from "@agentready/db";
import {
  CreateAgentExecutionInput,
  CreateToolCallTraceInput,
  matchPattern
} from "@agentready/shared";
import { canonicalizeJson, computeArgumentsHash, redactAndTruncate } from "../../lib/canonicalJson.js";
import { HttpError } from "../../lib/httpError.js";
import { toInputJson } from "../../lib/json.js";
import { AuditService } from "../audit/auditService.js";
import { GovernanceRepository } from "../governance/governanceRepository.js";
import { TenancyService } from "../tenancy/tenancyService.js";
import { AgentExecutionRepository } from "./agentExecutionRepository.js";
import {
  assertExecutionTransition,
  isTerminalExecutionStatus
} from "./executionStateMachine.js";

export class AgentExecutionService {
  constructor(
    private readonly executions: AgentExecutionRepository,
    private readonly governance: GovernanceRepository,
    private readonly audit: AuditService,
    private readonly tenancy: TenancyService
  ) {}

  // ─── Accept layer (called from API route) ───────────────────────────────────

  list(input: { organizationId: string; projectId?: string; status?: AgentExecutionStatus }) {
    return this.executions.list(input);
  }

  listTraces(input: {
    organizationId: string;
    executionId?: string;
    limit?: number;
    page?: number;
  }) {
    return this.executions.listTraces(input);
  }

  /**
   * Create a new execution in QUEUED status.
   *
   * Performs all governance and tenancy checks synchronously, then creates the
   * DB record. The caller (route or test) is responsible for enqueuing the work
   * via an ExecutionRunner after this method returns.
   *
   * TODO(WORKER-READY): When using a queue, the route calls:
   *   const execution = await service.create(input);
   *   await runner.enqueue({ id: execution.id, ... });
   * No changes to this method are required.
   */
  async create(input: CreateAgentExecutionInput) {
    await this.tenancy.requireProject({
      organizationId: input.organizationId,
      projectId: input.projectId
    });
    await this.tenancy.requireTask({
      organizationId: input.organizationId,
      taskId: input.taskId
    });
    await this.tenancy.requireContract({
      organizationId: input.organizationId,
      contractId: input.contractId
    });
    const isExecutionEnabled = await this.governance.findFeatureFlag({
      organizationId: input.organizationId,
      agentId: input.agentId,
      capability: "agent_execution"
    });
    if (isExecutionEnabled && isExecutionEnabled.state === "DISABLED") {
      throw new HttpError({
        code: "FORBIDDEN",
        message: "Agent execution is disabled by feature flag",
        statusCode: 403
      });
    }

    await this.tenancy.requireAgent({
      organizationId: input.organizationId,
      agentId: input.agentId
    });

    let initialStatus: AgentExecutionStatus = "QUEUED";
    let requiresApproval = false;
    let matchingGateReason = "";
    let matchingGateTool = "";

    if (input.contractId) {
      const contract = await this.executions.findContractById(input.contractId);
      if (contract && Array.isArray(contract.allowedTools)) {
        const gates = await this.governance.listApprovalGates({
          organizationId: input.organizationId
        });

        // Determine if auto-approval feature flag is disabled
        const autoApprovalFlag = await this.governance.findFeatureFlag({
          organizationId: input.organizationId,
          agentId: input.agentId,
          capability: "auto_approval"
        });
        const isAutoApprovalDisabled = autoApprovalFlag && autoApprovalFlag.state === "DISABLED";

        for (const toolName of contract.allowedTools as string[]) {
          const matchingGates = gates.filter(
            (g) => g.enabled && matchPattern(g.capability, toolName)
          );
          matchingGates.sort((a, b) => b.capability.length - a.capability.length);
          const gate = matchingGates[0];

          if (gate && input.riskScore >= gate.riskLevel) {
            let effectiveMode = gate.mode;
            if (effectiveMode === "AUTOMATIC" && isAutoApprovalDisabled) {
              effectiveMode = "REQUIRE_APPROVAL";
            }

            if (effectiveMode === "BLOCKED") {
              throw new HttpError({
                code: "FORBIDDEN",
                message: `Execution start blocked by policy: tool '${toolName}' is BLOCKED`,
                statusCode: 403
              });
            } else if (effectiveMode === "REQUIRE_APPROVAL") {
              requiresApproval = true;
              matchingGateTool = toolName;
              matchingGateReason = gate.reason || `Tool '${toolName}' requires human approval.`;
            }
          }
        }
      }
    }

    if (requiresApproval) {
      initialStatus = "WAITING_FOR_APPROVAL";
    }

    const execution = await this.executions.create({
      organizationId: input.organizationId,
      projectId: input.projectId,
      taskId: input.taskId,
      contractId: input.contractId,
      agentId: input.agentId,
      status: initialStatus,
      objective: input.objective,
      input: toInputJson(input.input),
      riskScore: input.riskScore,
      // Worker-readiness fields persisted from the creation request
      timeoutMs: input.timeoutMs,
      maxAttempts: input.maxAttempts ?? 1,
      attemptCount: 0
    });

    if (requiresApproval) {
      await this.governance.createApprovalRequest({
        organizationId: input.organizationId,
        agentId: input.agentId,
        requestedAction: `execution.start:${matchingGateTool}`,
        reason: `Risky execution start: ${matchingGateReason}`,
        payload: {
          executionId: execution.id,
          projectId: input.projectId,
          contractId: input.contractId,
          agentId: input.agentId,
          riskScore: input.riskScore
        },
        status: "PENDING"
      });
    }

    await this.audit.record({
      organizationId: input.organizationId,
      source: "AGENT",
      actorAgentId: input.agentId,
      action: "agent_execution.created",
      resourceType: "AgentExecution",
      resourceId: execution.id,
      after: {
        status: execution.status,
        objective: execution.objective,
        riskScore: execution.riskScore,
        projectId: execution.projectId,
        contractId: input.contractId,
        taskId: input.taskId,
        maxAttempts: input.maxAttempts ?? 1,
        timeoutMs: input.timeoutMs ?? null
      },
      metadata: {
        workerReady: true,
        ...(input.metadata ?? {})
      }
    });

    return execution;
  }

  get(input: { organizationId: string; id: string }) {
    return this.executions.findById(input);
  }

  // ─── Execute layer (called from ExecutionRunner / future worker) ─────────────

  /**
   * Claim an execution for processing: QUEUED → RUNNING, increment attemptCount.
   *
   * Called by ExecutionRunner.run() — not by the route directly.
   *
   * TODO(WORKER-READY): The worker process calls this after dequeuing a job,
   * providing idempotency protection by checking status before transitioning.
   */
  async claimForRun(input: { organizationId: string; id: string }) {
    const existing = await this.executions.findById({
      organizationId: input.organizationId,
      id: input.id
    });
    if (!existing) {
      throw new HttpError({
        code: "NOT_FOUND",
        message: "Agent execution was not found",
        statusCode: 404
      });
    }

    // Only claim if still QUEUED — prevents double-claiming in race conditions.
    if (existing.status !== "QUEUED") {
      return existing;
    }

    const now = new Date();
    return this.executions.updateStatus({
      organizationId: input.organizationId,
      id: input.id,
      status: "RUNNING",
      startedAt: existing.startedAt ?? now,
      attemptCount: (existing.attemptCount ?? 0) + 1
    });
  }

  /**
   * Mark an execution as FAILED due to timeout.
   *
   * Sets failureReason="TIMEOUT" and timedOutAt=now so the dashboard
   * and API consumers can distinguish timeout failures from logic failures.
   *
   * TODO(WORKER-READY): The worker's timeout handler calls this when a
   * job's deadline elapses. Uses the same DB write path as markFailed().
   */
  async markTimedOut(input: { organizationId: string; id: string }) {
    const existing = await this.executions.findById({
      organizationId: input.organizationId,
      id: input.id
    });
    if (!existing || isTerminalExecutionStatus(existing.status as AgentExecutionStatus)) {
      // Already terminal — nothing to do. Idempotent.
      return existing;
    }

    const now = new Date();
    const execution = await this.executions.updateStatus({
      organizationId: input.organizationId,
      id: input.id,
      status: "FAILED",
      completedAt: now,
      timedOutAt: now,
      failureReason: "TIMEOUT"
    });

    await this.audit.record({
      organizationId: input.organizationId,
      source: "SYSTEM",
      actorAgentId: existing.agentId,
      action: "agent_execution.timed_out",
      resourceType: "AgentExecution",
      resourceId: input.id,
      before: { status: existing.status },
      after: { status: "FAILED", failureReason: "TIMEOUT", timedOutAt: now.toISOString() }
    });

    return execution;
  }

  /**
   * Mark an execution as FAILED with a structured failure reason.
   * Used by the runner for unhandled errors (failureReason="RUNNER_ERROR")
   * and governance blocks (failureReason="POLICY_BLOCKED").
   *
   * TODO(WORKER-READY): The worker calls this when the agent throws an
   * unrecoverable error. "RUNNER_ERROR" failures are eligible for retry
   * (see markRetryable / listRetryable).
   */
  async markFailed(input: {
    organizationId: string;
    id: string;
    failureReason: "RUNNER_ERROR" | "POLICY_BLOCKED" | "TIMEOUT";
    errorMessage?: string;
  }) {
    const existing = await this.executions.findById({
      organizationId: input.organizationId,
      id: input.id
    });
    if (!existing || isTerminalExecutionStatus(existing.status as AgentExecutionStatus)) {
      return existing;
    }

    const now = new Date();
    const execution = await this.executions.updateStatus({
      organizationId: input.organizationId,
      id: input.id,
      status: "FAILED",
      completedAt: now,
      failureReason: input.failureReason,
      output: input.errorMessage ? { error: input.errorMessage } : undefined
    });

    await this.audit.record({
      organizationId: input.organizationId,
      source: "SYSTEM",
      actorAgentId: existing.agentId,
      action: "agent_execution.runner_failed",
      resourceType: "AgentExecution",
      resourceId: input.id,
      before: { status: existing.status },
      after: {
        status: "FAILED",
        failureReason: input.failureReason,
        errorMessage: input.errorMessage ?? null
      }
    });

    return execution;
  }

  /**
   * Re-queue a FAILED execution for another attempt if attemptCount < maxAttempts.
   *
   * TODO(WORKER-READY): The worker retry scheduler calls this to reset
   * eligible executions back to QUEUED so they are picked up again.
   * Returns null if the execution has exhausted its attempts.
   */
  async markRetryable(input: { organizationId: string; id: string }) {
    const existing = await this.executions.findById({
      organizationId: input.organizationId,
      id: input.id
    });
    if (!existing) return null;

    // Only retry RUNNER_ERROR failures — not TIMEOUT or POLICY_BLOCKED
    if (existing.status !== "FAILED" || existing.failureReason !== "RUNNER_ERROR") {
      return null;
    }

    const attemptCount = existing.attemptCount ?? 0;
    const maxAttempts = existing.maxAttempts ?? 1;

    if (attemptCount >= maxAttempts) {
      // Exhausted all attempts — not retryable.
      return null;
    }

    // Reset to QUEUED. attemptCount is left intact (incremented again on next claim).
    return this.executions.updateStatus({
      organizationId: input.organizationId,
      id: input.id,
      status: "QUEUED",
      failureReason: undefined,
      completedAt: undefined
    });
  }

  /**
   * List executions that have failed with a retryable error and still have
   * attempts remaining.
   *
   * TODO(WORKER-READY): The worker's retry cron calls this to get a batch of
   * work to re-enqueue. Currently exposed but not called in production — here
   * to define the API so the worker can import and use it without changes.
   */
  async listRetryable(input: { organizationId: string }) {
    const candidates = await this.executions.listRetryable(input);
    // Filter in application code: attemptCount < maxAttempts
    // TODO(WORKER-READY): Push this filter to SQL once worker is extracted.
    return candidates.filter(
      (e) => (e.attemptCount ?? 0) < (e.maxAttempts ?? 1)
    );
  }

  // ─── Shared (used by both layers) ────────────────────────────────────────────

  async transition(input: {
    organizationId: string;
    id: string;
    status: AgentExecutionStatus;
    output?: unknown;
    completedAt?: Date;
  }) {
    const existing = await this.executions.findById({
      organizationId: input.organizationId,
      id: input.id
    });
    if (!existing) {
      throw new HttpError({
        code: "NOT_FOUND",
        message: "Agent execution was not found",
        statusCode: 404
      });
    }

    assertExecutionTransition(existing.status, input.status);

    const now = new Date();
    const execution = await this.executions.updateStatus({
      organizationId: input.organizationId,
      id: input.id,
      status: input.status,
      output: input.output === undefined ? undefined : toInputJson(input.output),
      startedAt: existing.startedAt ?? (input.status === "RUNNING" ? now : undefined),
      completedAt: input.completedAt ?? (isTerminalExecutionStatus(input.status) ? now : undefined)
    });
    if (!execution) {
      throw new HttpError({
        code: "NOT_FOUND",
        message: "Agent execution was not found",
        statusCode: 404
      });
    }

    await this.audit.record({
      organizationId: execution.organizationId,
      source: "AGENT",
      actorAgentId: execution.agentId,
      action: "agent_execution.status_changed",
      resourceType: "AgentExecution",
      resourceId: execution.id,
      before: {
        status: existing.status,
        output: existing.output,
        completedAt: existing.completedAt
      },
      after: {
        status: execution.status,
        output: execution.output,
        completedAt: execution.completedAt
      }
    });

    return execution;
  }

  async recordToolCall(input: CreateToolCallTraceInput) {
    await this.tenancy.requireAgent({
      organizationId: input.organizationId,
      agentId: input.agentId
    });

    const execution = await this.executions.findById({
      organizationId: input.organizationId,
      id: input.executionId
    });
    if (!execution) {
      throw new HttpError({
        code: "NOT_FOUND",
        message: "Agent execution was not found for this organization",
        statusCode: 404
      });
    }

    const featureFlag = await this.governance.findFeatureFlag({
      organizationId: input.organizationId,
      agentId: input.agentId,
      capability: input.toolName
    });
    const globalToolFlag = await this.governance.findFeatureFlag({
      organizationId: input.organizationId,
      agentId: input.agentId,
      capability: "tool_execution"
    });
    const autoApprovalFlag = await this.governance.findFeatureFlag({
      organizationId: input.organizationId,
      agentId: input.agentId,
      capability: "auto_approval"
    });

    const isToolDisabled = (featureFlag && featureFlag.state === "DISABLED") || (globalToolFlag && globalToolFlag.state === "DISABLED");
    const isAutoApprovalDisabled = autoApprovalFlag && autoApprovalFlag.state === "DISABLED";

    const gates = await this.governance.listApprovalGates({
      organizationId: input.organizationId
    });

    const matchingGates = gates.filter(
      (g) => g.enabled && matchPattern(g.capability, input.toolName)
    );
    matchingGates.sort((a, b) => b.capability.length - a.capability.length);
    const gate = matchingGates[0];

    let status: ToolCallStatus = input.status;
    let error = input.error;
    let approvalRequestId = input.approvalRequestId;

    const gateTriggers = gate && execution.riskScore >= gate.riskLevel;

    let effectiveMode = gate?.mode;
    if (effectiveMode === "AUTOMATIC" && isAutoApprovalDisabled) {
      effectiveMode = "REQUIRE_APPROVAL";
    }

    if (isToolDisabled) {
      status = "BLOCKED";
      error = `Capability ${input.toolName} is disabled for this agent by feature flag.`;

      if (execution.status === "RUNNING") {
        await this.transition({
          organizationId: input.organizationId,
          id: execution.id,
          status: "FAILED",
          output: { error: `Execution blocked: Capability ${input.toolName} is disabled by feature flag.` }
        });
      }
    } else if (gateTriggers && effectiveMode === "BLOCKED") {
      status = "BLOCKED";
      error = gate.reason ?? `Capability ${input.toolName} is blocked by policy.`;
    } else if (gateTriggers && effectiveMode === "REQUIRE_APPROVAL" && status !== "BLOCKED") {
      const approval = await this.governance.createApprovalRequest({
        organizationId: input.organizationId,
        agentId: input.agentId,
        requestedAction: input.toolName,
        reason: gate.reason ?? `Capability ${input.toolName} requires approval.`,
        payload: toInputJson({
          executionId: input.executionId,
          toolName: input.toolName,
          input: input.input
        }),
        status: "PENDING"
      });
      approvalRequestId = approval.id;
      status = "BLOCKED";
      error = "approval_requested";

      if (execution.status === "RUNNING") {
        await this.transition({
          organizationId: input.organizationId,
          id: execution.id,
          status: "WAITING_FOR_APPROVAL"
        });
      }
    }

    const completed = ["SUCCEEDED", "FAILED", "BLOCKED"].includes(status);
    const trace = await this.executions.createTrace({
      organizationId: input.organizationId,
      executionId: input.executionId,
      agentId: input.agentId,
      toolName: input.toolName,
      status,
      input: toInputJson(input.input),
      output: input.output === undefined ? undefined : toInputJson(input.output),
      error,
      latencyMs: input.latencyMs,
      approvalRequestId,
      completedAt: completed ? new Date() : undefined
    });

    await this.audit.record({
      organizationId: input.organizationId,
      source: "AGENT",
      actorAgentId: input.agentId,
      action: "tool_call_trace.recorded",
      resourceType: "ToolCallTrace",
      resourceId: trace.id,
      after: {
        status: trace.status,
        toolName: trace.toolName,
        latencyMs: trace.latencyMs,
        approvalRequestId: trace.approvalRequestId,
        error: trace.error
      },
      metadata: {
        executionId: input.executionId,
        toolName: input.toolName
      }
    });

    return trace;
  }

  updateToolCallTrace(input: {
    organizationId: string;
    id: string;
    status: ToolCallStatus;
    output?: unknown;
    error?: string;
    latencyMs?: number;
  }) {
    return this.updateTenantScopedToolCallTrace(input);
  }

  private async updateTenantScopedToolCallTrace(input: {
    organizationId: string;
    id: string;
    status: ToolCallStatus;
    output?: unknown;
    error?: string;
    latencyMs?: number;
  }) {
    const existing = await this.executions.findTraceById({
      organizationId: input.organizationId,
      id: input.id
    });
    if (!existing) {
      throw new HttpError({
        code: "NOT_FOUND",
        message: "Tool-call trace was not found for this organization",
        statusCode: 404
      });
    }

    const trace = await this.executions.updateTrace({
      organizationId: input.organizationId,
      id: input.id,
      status: input.status,
      output: input.output === undefined ? undefined : toInputJson(input.output),
      error: input.error,
      latencyMs: input.latencyMs,
      completedAt: ["SUCCEEDED", "FAILED", "BLOCKED"].includes(input.status) ? new Date() : undefined
    });
    if (!trace) {
      throw new HttpError({
        code: "NOT_FOUND",
        message: "Tool-call trace was not found for this organization",
        statusCode: 404
      });
    }

    await this.audit.record({
      organizationId: input.organizationId,
      source: "AGENT",
      actorAgentId: existing.agentId,
      action: "tool_call_trace.updated",
      resourceType: "ToolCallTrace",
      resourceId: trace.id,
      before: {
        status: existing.status,
        output: existing.output,
        error: existing.error,
        latencyMs: existing.latencyMs,
        completedAt: existing.completedAt
      },
      after: {
        status: trace.status,
        output: trace.output,
        error: trace.error,
        latencyMs: trace.latencyMs,
        completedAt: trace.completedAt
      }
    });

    return trace;
  }

  async checkToolCall(input: {
    organizationId: string;
    executionId: string;
    toolName: string;
    arguments: Record<string, unknown>;
    idempotencyKey?: string;
    actorAgentId?: string;
    actorUserId?: string;
  }) {
    const execution = await this.executions.findById({
      organizationId: input.organizationId,
      id: input.executionId
    });
    if (!execution) {
      throw new HttpError({
        code: "NOT_FOUND",
        message: "Agent execution was not found",
        statusCode: 404
      });
    }

    if (input.actorAgentId && execution.agentId !== input.actorAgentId) {
      throw new HttpError({
        code: "NOT_FOUND",
        message: "Agent execution was not found",
        statusCode: 404
      });
    }

    // 1. Canonicalize arguments and compute hash
    const argumentsHash = computeArgumentsHash(input.arguments);
    const requestHash = crypto
      .createHash("sha256")
      .update(canonicalizeJson({ toolName: input.toolName, arguments: input.arguments }))
      .digest("hex");

    // 2. Idempotency check: return cached decision or 409 if payload differs
    if (input.idempotencyKey) {
      const cached = await this.executions.findIdempotencyKey(input.organizationId, input.idempotencyKey);
      if (cached) {
        if (cached.requestHash !== requestHash) {
          throw new HttpError({
            code: "IDEMPOTENCY_KEY_MISMATCH",
            message: "Idempotency key has already been used with a different request payload",
            statusCode: 409
          });
        }
        return cached.responseBody as {
          decision: "ALLOW" | "BLOCK" | "WAIT_FOR_APPROVAL";
          reason: string;
          toolCallTraceId: string;
          approvalRequestId?: string;
          executionStatus: string;
          consecutiveBlocks: number;
        };
      }
    }

    // 3. Single-flight enforcement: reject if another tool call is already PENDING
    const pendingTrace = await this.executions.findPendingTrace(execution.id);
    if (pendingTrace) {
      throw new HttpError({
        code: "CONCURRENT_TOOL_CALL_DISALLOWED",
        message: `A tool call (${pendingTrace.toolName}) is already pending for this execution. Complete it via POST /tool-calls/${pendingTrace.id}/result before checking another.`,
        statusCode: 409
      });
    }

    // 4. Calculate current consecutiveBlocks within the active execution attempt
    const attemptStart = execution.startedAt ?? execution.createdAt;
    const pastTraces = await this.executions.findTracesForExecution(execution.id, attemptStart);
    let consecutiveBlocks = 0;
    for (const t of pastTraces) {
      if (t.status === "AWAITING_APPROVAL") {
        continue;
      }
      if (t.status === "BLOCKED") {
        consecutiveBlocks++;
      } else {
        break;
      }
    }

    // 5. Check if there is an APPROVED ApprovalRequest for this execution and tool
    const matchingApproval = await this.executions.findApprovedRequest({
      organizationId: input.organizationId,
      executionId: execution.id,
      toolName: input.toolName
    });

    if (matchingApproval) {
      const payload = matchingApproval.payload as any;
      const approvalArgsHash = payload?.argumentsHash;
      if (!approvalArgsHash || approvalArgsHash === argumentsHash) {
        // Consume approval atomically
        await this.executions.consumeApprovalRequest(matchingApproval.id);

        // Transition existing AWAITING_APPROVAL trace in place (same traceId)
        let toolCallTraceId: string;
        const waitTrace = await this.executions.findTraceByApprovalId(matchingApproval.id);
        if (waitTrace) {
          await this.executions.updateTraceDirect(waitTrace.id, {
            status: "PENDING"
          });
          toolCallTraceId = waitTrace.id;
        } else {
          const newTrace = await this.executions.createTrace({
            organizationId: input.organizationId,
            executionId: execution.id,
            agentId: execution.agentId,
            toolName: input.toolName,
            status: "PENDING",
            input: toInputJson(redactAndTruncate(input.arguments)),
            approvalRequestId: matchingApproval.id
          });
          toolCallTraceId = newTrace.id;
        }

        // If execution was in WAITING_FOR_APPROVAL, transition back to RUNNING
        if (execution.status === "WAITING_FOR_APPROVAL") {
          await this.transition({
            organizationId: input.organizationId,
            id: execution.id,
            status: "RUNNING"
          });
        }

        const result = {
          decision: "ALLOW" as const,
          reason: "Tool execution approved by human reviewer",
          toolCallTraceId,
          executionStatus: "RUNNING",
          consecutiveBlocks: 0
        };

        if (input.idempotencyKey) {
          await this.executions.createIdempotencyKey({
            organizationId: input.organizationId,
            key: input.idempotencyKey,
            requestHash,
            route: `/executions/${execution.id}/tool-calls/check`,
            actorType: input.actorAgentId ? "AGENT" : "USER",
            actorAgentId: input.actorAgentId,
            actorUserId: input.actorUserId,
            responseStatus: 200,
            responseBody: toInputJson(result),
            expiresAt: new Date(Date.now() + 86400000)
          });
        }

        return result;
      }
    }

    // 6. Evaluate policy
    let decision: "ALLOW" | "BLOCK" | "WAIT_FOR_APPROVAL" = "ALLOW";
    let reason = "Tool permitted by task contract and governance policy";

    // a. Check Task Contract allowedTools
    if (execution.contractId) {
      const contract = await this.executions.findContractById(execution.contractId);
      if (contract && Array.isArray(contract.allowedTools) && contract.allowedTools.length > 0) {
        if (!contract.allowedTools.includes(input.toolName)) {
          decision = "BLOCK";
          reason = `Tool '${input.toolName}' is not allowed by task contract '${contract.name}'`;
        }
      }
    }

    // b. Check Feature Flags
    if (decision !== "BLOCK") {
      const [toolFlag, globalFlag, execFlag] = await Promise.all([
        this.governance.findFeatureFlag({
          organizationId: input.organizationId,
          agentId: execution.agentId,
          capability: input.toolName
        }),
        this.governance.findFeatureFlag({
          organizationId: input.organizationId,
          agentId: execution.agentId,
          capability: "tool_execution"
        }),
        this.governance.findFeatureFlag({
          organizationId: input.organizationId,
          agentId: execution.agentId,
          capability: "agent_execution"
        })
      ]);

      if (execFlag && execFlag.state === "DISABLED") {
        decision = "BLOCK";
        reason = "Agent execution is disabled by feature flag";
      } else if ((globalFlag && globalFlag.state === "DISABLED") || (toolFlag && toolFlag.state === "DISABLED")) {
        decision = "BLOCK";
        reason = `Tool '${input.toolName}' is disabled for this agent by feature flag`;
      }
    }

    // c. Check Approval Gates
    if (decision !== "BLOCK") {
      const gates = await this.governance.listApprovalGates({ organizationId: input.organizationId });
      const autoApprovalFlag = await this.governance.findFeatureFlag({
        organizationId: input.organizationId,
        agentId: execution.agentId,
        capability: "auto_approval"
      });
      const isAutoApprovalDisabled = autoApprovalFlag && autoApprovalFlag.state === "DISABLED";

      const matchingGates = gates.filter((g) => g.enabled && matchPattern(g.capability, input.toolName));
      matchingGates.sort((a, b) => b.capability.length - a.capability.length);
      const gate = matchingGates[0];

      if (gate && execution.riskScore >= gate.riskLevel) {
        let effectiveMode = gate.mode;
        if (effectiveMode === "AUTOMATIC" && isAutoApprovalDisabled) {
          effectiveMode = "REQUIRE_APPROVAL";
        }
        if (effectiveMode === "BLOCKED") {
          decision = "BLOCK";
          reason = gate.reason ?? `Tool '${input.toolName}' is blocked by policy`;
        } else if (effectiveMode === "REQUIRE_APPROVAL") {
          decision = "WAIT_FOR_APPROVAL";
          reason = gate.reason ?? `Tool '${input.toolName}' requires human approval`;
        }
      }
    }

    const redactedInput = redactAndTruncate(input.arguments);

    let result: {
      decision: "ALLOW" | "BLOCK" | "WAIT_FOR_APPROVAL";
      reason: string;
      toolCallTraceId: string;
      approvalRequestId?: string;
      executionStatus: string;
      consecutiveBlocks: number;
    };

    if (decision === "ALLOW") {
      const trace = await this.executions.createTrace({
        organizationId: input.organizationId,
        executionId: execution.id,
        agentId: execution.agentId,
        toolName: input.toolName,
        status: "PENDING",
        input: toInputJson(redactedInput)
      });

      result = {
        decision: "ALLOW",
        reason,
        toolCallTraceId: trace.id,
        executionStatus: "RUNNING",
        consecutiveBlocks: 0
      };
    } else if (decision === "BLOCK") {
      consecutiveBlocks++;
      const trace = await this.executions.createTrace({
        organizationId: input.organizationId,
        executionId: execution.id,
        agentId: execution.agentId,
        toolName: input.toolName,
        status: "BLOCKED",
        input: toInputJson(redactedInput),
        error: reason,
        completedAt: new Date()
      });

      if (consecutiveBlocks >= 3) {
        await this.markFailed({
          organizationId: input.organizationId,
          id: execution.id,
          failureReason: "POLICY_VIOLATION_LIMIT" as any,
          errorMessage: "Policy violation limit reached (3 consecutive blocked attempts). Execution terminated."
        });

        result = {
          decision: "BLOCK",
          reason: "Policy violation limit reached (3 consecutive blocked attempts). Execution terminated.",
          toolCallTraceId: trace.id,
          executionStatus: "FAILED",
          consecutiveBlocks: 3
        };
      } else {
        result = {
          decision: "BLOCK",
          reason,
          toolCallTraceId: trace.id,
          executionStatus: execution.status,
          consecutiveBlocks
        };
      }
    } else {
      // WAIT_FOR_APPROVAL
      const approval = await this.governance.createApprovalRequest({
        organizationId: input.organizationId,
        agentId: execution.agentId,
        requestedAction: input.toolName,
        reason,
        payload: toInputJson({
          executionId: execution.id,
          toolName: input.toolName,
          arguments: redactedInput,
          argumentsHash
        }),
        status: "PENDING"
      });

      const trace = await this.executions.createTrace({
        organizationId: input.organizationId,
        executionId: execution.id,
        agentId: execution.agentId,
        toolName: input.toolName,
        status: "AWAITING_APPROVAL",
        input: toInputJson(redactedInput),
        approvalRequestId: approval.id
      });

      if (execution.status === "RUNNING") {
        await this.transition({
          organizationId: input.organizationId,
          id: execution.id,
          status: "WAITING_FOR_APPROVAL"
        });
      }

      result = {
        decision: "WAIT_FOR_APPROVAL",
        reason,
        toolCallTraceId: trace.id,
        approvalRequestId: approval.id,
        executionStatus: "WAITING_FOR_APPROVAL",
        consecutiveBlocks
      };
    }

    if (input.idempotencyKey) {
      await this.executions.createIdempotencyKey({
        organizationId: input.organizationId,
        key: input.idempotencyKey,
        requestHash,
        route: `/executions/${execution.id}/tool-calls/check`,
        actorType: input.actorAgentId ? "AGENT" : "USER",
        actorAgentId: input.actorAgentId,
        actorUserId: input.actorUserId,
        responseStatus: 200,
        responseBody: toInputJson(result),
        expiresAt: new Date(Date.now() + 86400000)
      });
    }

    return result;
  }

  async reportToolCallResult(input: {
    organizationId: string;
    traceId: string;
    status: "SUCCEEDED" | "FAILED";
    output?: Record<string, unknown>;
    error?: string;
    latencyMs?: number;
    isFinalAction?: boolean;
    actorAgentId?: string;
  }) {
    const trace = await this.executions.findTraceByOwnership({
      organizationId: input.organizationId,
      id: input.traceId,
      agentId: input.actorAgentId
    });

    if (!trace) {
      throw new HttpError({
        code: "NOT_FOUND",
        message: "Tool call trace was not found",
        statusCode: 404
      });
    }

    // State-based idempotency: only act on PENDING trace
    if (trace.status !== "PENDING") {
      return {
        toolCallTraceId: trace.id,
        status: trace.status,
        output: trace.output,
        error: trace.error,
        executionId: trace.executionId,
        executionStatus: "RUNNING",
        completedAt: trace.completedAt ?? new Date()
      };
    }

    const redactedOutput = input.output ? redactAndTruncate(input.output) : undefined;
    const updatedTrace = await this.executions.updateTrace({
      organizationId: input.organizationId,
      id: trace.id,
      status: input.status,
      output: redactedOutput === undefined ? undefined : toInputJson(redactedOutput),
      error: input.error,
      latencyMs: input.latencyMs,
      completedAt: new Date()
    });

    await this.audit.record({
      organizationId: input.organizationId,
      source: "AGENT",
      actorAgentId: trace.agentId,
      action: "tool_call_trace.completed",
      resourceType: "ToolCallTrace",
      resourceId: trace.id,
      before: { status: trace.status },
      after: { status: updatedTrace?.status, output: updatedTrace?.output, error: updatedTrace?.error }
    });

    let executionStatus = "RUNNING";
    if (input.isFinalAction) {
      if (input.status === "SUCCEEDED") {
        const updatedExec = await this.transition({
          organizationId: input.organizationId,
          id: trace.executionId,
          status: "SUCCEEDED",
          output: redactedOutput,
          completedAt: new Date()
        });
        executionStatus = updatedExec.status;
      } else {
        const updatedExec = await this.markFailed({
          organizationId: input.organizationId,
          id: trace.executionId,
          failureReason: "RUNNER_ERROR",
          errorMessage: input.error ?? "Tool call failed on final action"
        });
        executionStatus = updatedExec?.status ?? "FAILED";
      }
    }

    return {
      toolCallTraceId: trace.id,
      status: input.status,
      executionId: trace.executionId,
      executionStatus,
      completedAt: updatedTrace?.completedAt ?? new Date()
    };
  }
}
