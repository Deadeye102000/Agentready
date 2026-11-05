import type { PrismaClient } from "@agentready/db";

export class TenancyRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async projectBelongsToOrganization(input: { organizationId: string; projectId: string }) {
    // ⚡ Bolt: Using findFirst instead of count for existence checks allows the database to return immediately upon finding the first match
    return (
      (await this.prisma.project.findFirst({
        where: { id: input.projectId, organizationId: input.organizationId },
        select: { id: true }
      })) !== null
    );
  }

  async taskBelongsToOrganization(input: { organizationId: string; taskId: string }) {
    // ⚡ Bolt: Using findFirst instead of count for existence checks allows the database to return immediately upon finding the first match
    return (
      (await this.prisma.task.findFirst({
        where: { id: input.taskId, organizationId: input.organizationId },
        select: { id: true }
      })) !== null
    );
  }

  async agentBelongsToOrganization(input: { organizationId: string; agentId: string }) {
    // ⚡ Bolt: Using findFirst instead of count for existence checks allows the database to return immediately upon finding the first match
    return (
      (await this.prisma.agentIdentity.findFirst({
        where: { id: input.agentId, organizationId: input.organizationId },
        select: { id: true }
      })) !== null
    );
  }

  async contractBelongsToOrganization(input: { organizationId: string; contractId: string }) {
    // ⚡ Bolt: Using findFirst instead of count for existence checks allows the database to return immediately upon finding the first match
    return (
      (await this.prisma.taskContract.findFirst({
        where: { id: input.contractId, organizationId: input.organizationId },
        select: { id: true }
      })) !== null
    );
  }

  async executionBelongsToOrganization(input: { organizationId: string; executionId: string }) {
    // ⚡ Bolt: Using findFirst instead of count for existence checks allows the database to return immediately upon finding the first match
    return (
      (await this.prisma.agentExecution.findFirst({
        where: { id: input.executionId, organizationId: input.organizationId },
        select: { id: true }
      })) !== null
    );
  }
}
