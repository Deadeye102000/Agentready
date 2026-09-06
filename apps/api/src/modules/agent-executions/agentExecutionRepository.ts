import type { AgentExecutionStatus, Prisma, PrismaClient, ToolCallStatus } from "@agentready/db";

export class AgentExecutionRepository {
  constructor(private readonly prisma: PrismaClient) {}

  list(input: { organizationId: string; projectId?: string; status?: AgentExecutionStatus }) {
    return this.prisma.agentExecution.findMany({
      where: {
        organizationId: input.organizationId,
        projectId: input.projectId,
        status: input.status
      },
      include: {
        agent: { select: { id: true, name: true } },
        contract: { select: { id: true, name: true, version: true } },
        task: { select: { id: true, title: true, status: true } },
        _count: { select: { toolCallTraces: true, evalRuns: true } }
      },
      orderBy: [{ createdAt: "desc" }],
      take: 50
    });
  }

  create(data: Prisma.AgentExecutionUncheckedCreateInput & { organizationId: string }) {
    return this.prisma.agentExecution.create({ data });
  }

  findContractById(id: string) {
    return this.prisma.taskContract.findFirst({
      where: { id }
    });
  }

  findById(input: { organizationId: string; id: string }) {
    return this.prisma.agentExecution.findFirst({
      where: {
        id: input.id,
        organizationId: input.organizationId
      },
      include: {
        agent: { select: { id: true, name: true } },
        project: { select: { id: true, name: true } },
        contract: true,
        task: true,
        toolCallTraces: { orderBy: { startedAt: "asc" } },
        evalRuns: { orderBy: { createdAt: "desc" } }
      }
    });
  }

  /**
   * Update execution status along with optional worker-readiness metadata.
   *
   * TODO(WORKER-READY): The worker process calls this (via the service) to
   * persist state transitions, including timeout/retry fields.
   */
  async updateStatus(input: {
    organizationId: string;
    id: string;
    status: AgentExecutionStatus;
    output?: Prisma.InputJsonValue;
    startedAt?: Date;
    completedAt?: Date;
    // --- Worker-readiness fields ---
    attemptCount?: number;
    timedOutAt?: Date;
    failureReason?: string;
  }) {
    await this.prisma.agentExecution.updateMany({
      where: {
        id: input.id,
        organizationId: input.organizationId
      },
      data: {
        status: input.status,
        output: input.output,
        startedAt: input.startedAt,
        completedAt: input.completedAt,
        // Worker-readiness fields — only written when explicitly provided
        ...(input.attemptCount !== undefined && { attemptCount: input.attemptCount }),
        ...(input.timedOutAt !== undefined && { timedOutAt: input.timedOutAt }),
        ...(input.failureReason !== undefined && { failureReason: input.failureReason }),
      }
    });

    return this.findById({ organizationId: input.organizationId, id: input.id });
  }

  /**
   * List executions that have failed but still have attempts remaining.
   * Used by the future worker to schedule retries.
   *
   * TODO(WORKER-READY): The worker calls this on startup (or via cron) to
   * re-enqueue retryable executions. Currently unused — here to define the API.
   */
  listRetryable(input: { organizationId: string }) {
    return this.prisma.agentExecution.findMany({
      where: {
        organizationId: input.organizationId,
        status: "FAILED",
        // Only retry if there are attempts remaining and the failure is retryable
        // (i.e., not timed-out or policy-blocked — those need human review)
        failureReason: "RUNNER_ERROR",
        // attemptCount < maxAttempts — Prisma supports column comparisons via raw SQL,
        // but for simplicity the service layer filters after fetch for now.
        // TODO(WORKER-READY): Replace with a raw WHERE clause for efficiency at scale.
      },
      orderBy: { createdAt: "asc" },
      take: 100
    });
  }

  findTraceById(input: { organizationId: string; id: string }) {
    return this.prisma.toolCallTrace.findFirst({
      where: {
        id: input.id,
        organizationId: input.organizationId
      }
    });
  }

  findTraceByOwnership(input: { organizationId: string; id: string; agentId?: string }) {
    return this.prisma.toolCallTrace.findFirst({
      where: {
        id: input.id,
        organizationId: input.organizationId,
        ...(input.agentId ? { agentId: input.agentId } : {})
      }
    });
  }

  findPendingTrace(executionId: string) {
    return this.prisma.toolCallTrace.findFirst({
      where: {
        executionId,
        status: "PENDING"
      }
    });
  }

  findTraceByApprovalId(approvalRequestId: string) {
    return this.prisma.toolCallTrace.findFirst({
      where: {
        approvalRequestId
      }
    });
  }

  findTracesForExecution(executionId: string, since?: Date) {
    return this.prisma.toolCallTrace.findMany({
      where: {
        executionId,
        ...(since ? { startedAt: { gte: since } } : {})
      },
      orderBy: { startedAt: "desc" }
    });
  }

  async listTraces(input: {
    organizationId: string;
    executionId?: string;
    limit?: number;
    page?: number;
  }) {
    const limit = Math.min(Math.max(input.limit ?? 50, 1), 100);
    const page = Math.max(input.page ?? 1, 1);
    const skip = (page - 1) * limit;

    const where: Prisma.ToolCallTraceWhereInput = {
      organizationId: input.organizationId,
      ...(input.executionId ? { executionId: input.executionId } : {})
    };

    const [total, data] = await Promise.all([
      this.prisma.toolCallTrace.count({ where }),
      this.prisma.toolCallTrace.findMany({
        where,
        orderBy: [{ startedAt: "asc" }, { id: "asc" }],
        skip,
        take: limit,
        include: {
          agent: { select: { id: true, name: true } }
        }
      })
    ]);

    return {
      data,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit)
      }
    };
  }

  createTrace(data: Prisma.ToolCallTraceUncheckedCreateInput & { organizationId: string }) {
    return this.prisma.toolCallTrace.create({ data });
  }

  async updateTrace(input: {
    organizationId: string;
    id: string;
    status: ToolCallStatus;
    output?: Prisma.InputJsonValue;
    error?: string;
    latencyMs?: number;
    completedAt?: Date;
  }) {
    await this.prisma.toolCallTrace.updateMany({
      where: {
        id: input.id,
        organizationId: input.organizationId
      },
      data: {
        status: input.status,
        output: input.output,
        error: input.error,
        latencyMs: input.latencyMs,
        completedAt: input.completedAt
      }
    });

    return this.findTraceById({ organizationId: input.organizationId, id: input.id });
  }

  async updateTraceDirect(id: string, data: Prisma.ToolCallTraceUncheckedUpdateInput) {
    return this.prisma.toolCallTrace.update({
      where: { id },
      data
    });
  }

  async updateTracesForApproval(
    approvalRequestId: string,
    data: { status: ToolCallStatus; error?: string; completedAt?: Date }
  ) {
    return this.prisma.toolCallTrace.updateMany({
      where: {
        approvalRequestId,
        status: "AWAITING_APPROVAL"
      },
      data
    });
  }

  findApprovedRequest(input: { organizationId: string; executionId: string; toolName: string }) {
    return this.prisma.approvalRequest.findFirst({
      where: {
        organizationId: input.organizationId,
        status: "APPROVED",
        requestedAction: input.toolName,
        payload: {
          path: ["executionId"],
          equals: input.executionId
        }
      }
    });
  }

  consumeApprovalRequest(approvalId: string) {
    return this.prisma.approvalRequest.update({
      where: { id: approvalId },
      data: { status: "CONSUMED" }
    });
  }

  findIdempotencyKey(organizationId: string, key: string) {
    return this.prisma.idempotencyKey.findUnique({
      where: {
        organizationId_key: {
          organizationId,
          key
        }
      }
    });
  }

  createIdempotencyKey(data: Prisma.IdempotencyKeyUncheckedCreateInput) {
    return this.prisma.idempotencyKey.create({ data });
  }
}
