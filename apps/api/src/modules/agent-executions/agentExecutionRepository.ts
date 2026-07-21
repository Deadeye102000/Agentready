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

  create(data: Prisma.AgentExecutionUncheckedCreateInput) {
    return this.prisma.agentExecution.create({ data });
  }

  findById(input: { organizationId: string; id: string }) {
    return this.prisma.agentExecution.findFirst({
      where: {
        id: input.id,
        organizationId: input.organizationId
      },
      include: {
        agent: { select: { id: true, name: true } },
        contract: true,
        task: true,
        toolCallTraces: { orderBy: { startedAt: "asc" } },
        evalRuns: { orderBy: { createdAt: "desc" } }
      }
    });
  }

  updateStatus(input: {
    id: string;
    status: AgentExecutionStatus;
    output?: Prisma.InputJsonValue;
    startedAt?: Date;
    completedAt?: Date;
  }) {
    return this.prisma.agentExecution.update({
      where: { id: input.id },
      data: {
        status: input.status,
        output: input.output,
        startedAt: input.startedAt,
        completedAt: input.completedAt
      }
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

  createTrace(data: Prisma.ToolCallTraceUncheckedCreateInput) {
    return this.prisma.toolCallTrace.create({ data });
  }

  updateTrace(input: {
    id: string;
    status: ToolCallStatus;
    output?: Prisma.InputJsonValue;
    error?: string;
    latencyMs?: number;
    completedAt?: Date;
  }) {
    return this.prisma.toolCallTrace.update({
      where: { id: input.id },
      data: {
        status: input.status,
        output: input.output,
        error: input.error,
        latencyMs: input.latencyMs,
        completedAt: input.completedAt
      }
    });
  }
}
