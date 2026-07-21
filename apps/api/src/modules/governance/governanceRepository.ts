import type { ApprovalStatus, Prisma, PrismaClient } from "@agentready/db";

export class GovernanceRepository {
  constructor(private readonly prisma: PrismaClient) {}

  listApprovalGates(input: { organizationId: string }) {
    return this.prisma.approvalGate.findMany({
      where: { organizationId: input.organizationId },
      orderBy: [{ capability: "asc" }]
    });
  }

  upsertApprovalGate(input: Prisma.ApprovalGateUncheckedCreateInput) {
    return this.prisma.approvalGate.upsert({
      where: {
        organizationId_capability: {
          organizationId: input.organizationId,
          capability: input.capability
        }
      },
      update: {
        mode: input.mode,
        reason: input.reason
      },
      create: input
    });
  }

  findApprovalGate(input: { organizationId: string; capability: string }) {
    return this.prisma.approvalGate.findUnique({
      where: {
        organizationId_capability: {
          organizationId: input.organizationId,
          capability: input.capability
        }
      }
    });
  }

  listFeatureFlags(input: { organizationId: string }) {
    return this.prisma.agentFeatureFlag.findMany({
      where: { organizationId: input.organizationId },
      include: { agent: { select: { id: true, name: true } } },
      orderBy: [{ capability: "asc" }]
    });
  }

  upsertFeatureFlag(input: {
    organizationId: string;
    agentId: string;
    capability: string;
    state: "ENABLED" | "DISABLED";
    description?: string;
  }) {
    return this.prisma.agentFeatureFlag.upsert({
      where: {
        organizationId_agentId_capability: {
          organizationId: input.organizationId,
          agentId: input.agentId,
          capability: input.capability
        }
      },
      update: {
        state: input.state,
        description: input.description
      },
      create: input
    });
  }

  findFeatureFlag(input: { organizationId: string; agentId: string; capability: string }) {
    return this.prisma.agentFeatureFlag.findUnique({
      where: {
        organizationId_agentId_capability: {
          organizationId: input.organizationId,
          agentId: input.agentId,
          capability: input.capability
        }
      }
    });
  }

  createApprovalRequest(input: Prisma.ApprovalRequestUncheckedCreateInput) {
    return this.prisma.approvalRequest.create({ data: input });
  }

  listApprovalRequests(input: { organizationId: string; status?: ApprovalStatus }) {
    return this.prisma.approvalRequest.findMany({
      where: {
        organizationId: input.organizationId,
        status: input.status
      },
      include: {
        agent: { select: { id: true, name: true } },
        reviewedByUser: { select: { id: true, email: true, name: true } }
      },
      orderBy: [{ createdAt: "desc" }],
      take: 50
    });
  }

  findApprovalRequest(input: { organizationId: string; id: string }) {
    return this.prisma.approvalRequest.findFirst({
      where: {
        id: input.id,
        organizationId: input.organizationId
      }
    });
  }

  reviewApprovalRequest(input: { id: string; status: "APPROVED" | "REJECTED"; reviewedByUserId: string }) {
    return this.prisma.approvalRequest.update({
      where: { id: input.id },
      data: {
        status: input.status,
        reviewedByUserId: input.reviewedByUserId,
        reviewedAt: new Date()
      }
    });
  }

  listMcpServers(input: { organizationId: string }) {
    return this.prisma.mcpServerRegistration.findMany({
      where: { organizationId: input.organizationId },
      orderBy: [{ name: "asc" }]
    });
  }
}
