import type { PrismaClient } from "@agentready/db";

export class TenancyRepository {
  constructor(private readonly prisma: PrismaClient) {}

  // PERFORMANCE OPTIMIZATION: Replaced .count() with .findFirst({ select: { id: true } })
  // for existence checks. .findFirst is faster than .count() as it stops scanning once
  // a match is found and selecting only the id minimizes payload size.

  async projectBelongsToOrganization(input: { organizationId: string; projectId: string }) {
    return (
      (await this.prisma.project.findFirst({
        where: { id: input.projectId, organizationId: input.organizationId },
        select: { id: true }
      })) !== null
    );
  }

  async taskBelongsToOrganization(input: { organizationId: string; taskId: string }) {
    return (
      (await this.prisma.task.findFirst({
        where: { id: input.taskId, organizationId: input.organizationId },
        select: { id: true }
      })) !== null
    );
  }

  async agentBelongsToOrganization(input: { organizationId: string; agentId: string }) {
    return (
      (await this.prisma.agentIdentity.findFirst({
        where: { id: input.agentId, organizationId: input.organizationId },
        select: { id: true }
      })) !== null
    );
  }

  async contractBelongsToOrganization(input: { organizationId: string; contractId: string }) {
    return (
      (await this.prisma.taskContract.findFirst({
        where: { id: input.contractId, organizationId: input.organizationId },
        select: { id: true }
      })) !== null
    );
  }

  async executionBelongsToOrganization(input: { organizationId: string; executionId: string }) {
    return (
      (await this.prisma.agentExecution.findFirst({
        where: { id: input.executionId, organizationId: input.organizationId },
        select: { id: true }
      })) !== null
    );
  }
}
