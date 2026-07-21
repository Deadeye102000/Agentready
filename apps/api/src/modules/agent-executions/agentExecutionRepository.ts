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

  async updateStatus(input: {
    organizationId: string;
    id: string;
    status: AgentExecutionStatus;
    output?: Prisma.InputJsonValue;
    startedAt?: Date;
    completedAt?: Date;
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
        completedAt: input.completedAt
      }
    });

    return this.findById({ organizationId: input.organizationId, id: input.id });
  }

  findTraceById(input: { organizationId: string; id: string }) {
    return this.prisma.toolCallTrace.findFirst({
      where: {
        id: input.id,
        organizationId: input.organizationId
      }
    });
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
}
