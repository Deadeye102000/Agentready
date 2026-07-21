import type { Prisma, PrismaClient } from "@agentready/db";

export class TaskContractRepository {
  constructor(private readonly prisma: PrismaClient) {}

  list(input: { organizationId: string; projectId?: string }) {
    return this.prisma.taskContract.findMany({
      where: {
        organizationId: input.organizationId,
        projectId: input.projectId
      },
      include: {
        agent: { select: { id: true, name: true } },
        task: { select: { id: true, title: true, status: true } },
        _count: { select: { executions: true, evalRuns: true } }
      },
      orderBy: [{ updatedAt: "desc" }]
    });
  }

  create(data: Prisma.TaskContractUncheckedCreateInput & { organizationId: string }) {
    return this.prisma.taskContract.create({ data });
  }

  findById(input: { organizationId: string; id: string }) {
    return this.prisma.taskContract.findFirst({
      where: {
        id: input.id,
        organizationId: input.organizationId
      },
      include: {
        agent: { select: { id: true, name: true } },
        task: { select: { id: true, title: true, status: true } },
        executions: { orderBy: { createdAt: "desc" }, take: 10 },
        evalRuns: { orderBy: { createdAt: "desc" }, take: 10 }
      }
    });
  }
}
