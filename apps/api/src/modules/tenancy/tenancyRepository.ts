import type { PrismaClient } from "@agentready/db";

export class TenancyRepository {
  constructor(private readonly prisma: PrismaClient) {}

  // Optimization: using findFirst({select: {id: true}}) !== null is more efficient than count() === 1
  // because the database can return immediately upon finding the first match instead of counting all matches.
  async projectBelongsToOrganization(input: { organizationId: string; projectId: string }) {
    const match = await this.prisma.project.findFirst({
      where: { id: input.projectId, organizationId: input.organizationId },
      select: { id: true }
    });
    return match !== null;
  }

  async taskBelongsToOrganization(input: { organizationId: string; taskId: string }) {
    const match = await this.prisma.task.findFirst({
      where: { id: input.taskId, organizationId: input.organizationId },
      select: { id: true }
    });
    return match !== null;
  }

  async agentBelongsToOrganization(input: { organizationId: string; agentId: string }) {
    const match = await this.prisma.agentIdentity.findFirst({
      where: { id: input.agentId, organizationId: input.organizationId },
      select: { id: true }
    });
    return match !== null;
  }

  async contractBelongsToOrganization(input: { organizationId: string; contractId: string }) {
    const match = await this.prisma.taskContract.findFirst({
      where: { id: input.contractId, organizationId: input.organizationId },
      select: { id: true }
    });
    return match !== null;
  }

  async executionBelongsToOrganization(input: { organizationId: string; executionId: string }) {
    const match = await this.prisma.agentExecution.findFirst({
      where: { id: input.executionId, organizationId: input.organizationId },
      select: { id: true }
    });
    return match !== null;
  }
}
