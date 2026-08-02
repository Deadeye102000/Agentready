import type { Prisma, PrismaClient } from "@agentready/db";

export class EvalRunRepository {
  constructor(private readonly prisma: PrismaClient) {}

  list(input: { organizationId: string; projectId?: string; executionId?: string; evalCaseId?: string }) {
    return this.prisma.evalRun.findMany({
      where: {
        organizationId: input.organizationId,
        projectId: input.projectId,
        executionId: input.executionId,
        evalCaseId: input.evalCaseId
      },
      include: {
        agent: { select: { id: true, name: true } },
        contract: { select: { id: true, name: true, version: true } },
        execution: { select: { id: true, status: true, objective: true } },
        evalCase: { select: { id: true, name: true } }
      },
      orderBy: [{ createdAt: "desc" }],
      take: 50
    });
  }

  create(data: Prisma.EvalRunUncheckedCreateInput & { organizationId: string }) {
    return this.prisma.evalRun.create({ data });
  }

  // Eval Cases Repository Methods
  createCase(data: Prisma.EvalCaseUncheckedCreateInput & { organizationId: string }) {
    return this.prisma.evalCase.create({ data });
  }

  listCases(input: { organizationId: string; taskContractId?: string }) {
    return this.prisma.evalCase.findMany({
      where: {
        organizationId: input.organizationId,
        taskContractId: input.taskContractId
      },
      orderBy: [{ createdAt: "desc" }],
      take: 50
    });
  }

  findCaseById(input: { organizationId: string; id: string }) {
    return this.prisma.evalCase.findFirst({
      where: {
        organizationId: input.organizationId,
        id: input.id
      },
      include: {
        taskContract: true
      }
    });
  }
}
