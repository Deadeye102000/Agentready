import type { PrismaClient } from "@agentready/db";

export class TenancyRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async projectBelongsToOrganization(input: { organizationId: string; projectId: string }) {
    return (
      (await this.prisma.project.count({
        where: { id: input.projectId, organizationId: input.organizationId }
      })) === 1
    );
  }

  async taskBelongsToOrganization(input: { organizationId: string; taskId: string }) {
    return (
      (await this.prisma.task.count({
        where: { id: input.taskId, organizationId: input.organizationId }
      })) === 1
    );
  }

  async agentBelongsToOrganization(input: { organizationId: string; agentId: string }) {
    return (
      (await this.prisma.agentIdentity.count({
        where: { id: input.agentId, organizationId: input.organizationId }
      })) === 1
    );
  }

  async contractBelongsToOrganization(input: { organizationId: string; contractId: string }) {
    return (
      (await this.prisma.taskContract.count({
        where: { id: input.contractId, organizationId: input.organizationId }
      })) === 1
    );
  }

  async executionBelongsToOrganization(input: { organizationId: string; executionId: string }) {
    return (
      (await this.prisma.agentExecution.count({
        where: { id: input.executionId, organizationId: input.organizationId }
      })) === 1
    );
  }
}
