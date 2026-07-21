import type { Prisma, PrismaClient } from "@agentready/db";

export class EvalRunRepository {
  constructor(private readonly prisma: PrismaClient) {}

  list(input: { organizationId: string; projectId?: string; executionId?: string }) {
    return this.prisma.evalRun.findMany({
      where: {
        organizationId: input.organizationId,
        projectId: input.projectId,
        executionId: input.executionId
      },
      include: {
        agent: { select: { id: true, name: true } },
        contract: { select: { id: true, name: true, version: true } },
        execution: { select: { id: true, status: true, objective: true } }
      },
      orderBy: [{ createdAt: "desc" }],
      take: 50
    });
  }

  create(data: Prisma.EvalRunUncheckedCreateInput & { organizationId: string }) {
    return this.prisma.evalRun.create({ data });
  }
}
