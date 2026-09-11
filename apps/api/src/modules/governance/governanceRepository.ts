import type { ApprovalStatus, Prisma, PrismaClient } from "@agentready/db";
import { ApprovalWebhookService } from "./approvalWebhookService.js";

export class GovernanceRepository {
  private readonly webhookService: ApprovalWebhookService;

  constructor(
    private readonly prisma: PrismaClient,
    webhookService?: ApprovalWebhookService
  ) {
    this.webhookService = webhookService ?? new ApprovalWebhookService(prisma);
  }

  listApprovalGates(input: { organizationId: string }) {
    return this.prisma.approvalGate.findMany({
      where: { organizationId: input.organizationId },
      orderBy: [{ capability: "asc" }]
    });
  }

  upsertApprovalGate(input: {
    organizationId: string;
    capability: string;
    mode: any;
    reason?: string | null;
    riskLevel?: number;
    enabled?: boolean;
  }) {
    const { organizationId, capability, mode, reason, riskLevel, enabled } = input;
    return this.prisma.approvalGate.upsert({
      where: {
        organizationId_capability: {
          organizationId,
          capability
        }
      },
      update: {
        mode,
        reason,
        riskLevel: riskLevel !== undefined ? riskLevel : undefined,
        enabled: enabled !== undefined ? enabled : undefined
      },
      create: {
        organizationId,
        capability,
        mode,
        reason,
        riskLevel: riskLevel ?? 0,
        enabled: enabled ?? true
      }
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

  async upsertFeatureFlag(input: {
    organizationId: string;
    agentId: string | null;
    capability: string;
    state: "ENABLED" | "DISABLED";
    description?: string;
  }) {
    const existing = await this.prisma.agentFeatureFlag.findFirst({
      where: {
        organizationId: input.organizationId,
        agentId: input.agentId,
        capability: input.capability
      }
    });

    if (existing) {
      return this.prisma.agentFeatureFlag.update({
        where: { id: existing.id },
        data: {
          state: input.state,
          description: input.description
        }
      });
    } else {
      return this.prisma.agentFeatureFlag.create({
        data: {
          organizationId: input.organizationId,
          agentId: input.agentId,
          capability: input.capability,
          state: input.state,
          description: input.description
        }
      });
    }
  }

  async findFeatureFlag(input: { organizationId: string; agentId?: string | null; capability: string }) {
    if (input.agentId) {
      const specific = await this.prisma.agentFeatureFlag.findFirst({
        where: {
          organizationId: input.organizationId,
          agentId: input.agentId,
          capability: input.capability
        }
      });
      if (specific) return specific;
    }
    return this.prisma.agentFeatureFlag.findFirst({
      where: {
        organizationId: input.organizationId,
        agentId: null,
        capability: input.capability
      }
    });
  }

  async createApprovalRequest(input: Prisma.ApprovalRequestUncheckedCreateInput & { organizationId: string }) {
    const row = await this.prisma.approvalRequest.create({ data: input });
    this.webhookService.dispatch("approval.created", row);
    return row;
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

  async reviewApprovalRequest(input: {
    organizationId: string;
    id: string;
    status: "APPROVED" | "REJECTED" | "EXPIRED";
    reviewedByUserId: string;
  }) {
    await this.prisma.approvalRequest.updateMany({
      where: {
        id: input.id,
        organizationId: input.organizationId
      },
      data: {
        status: input.status,
        reviewedByUserId: input.reviewedByUserId,
        reviewedAt: new Date()
      }
    });

    return this.findApprovalRequest({ organizationId: input.organizationId, id: input.id });
  }

  listMcpServers(input: { organizationId: string }) {
    return this.prisma.mcpServerRegistration.findMany({
      where: { organizationId: input.organizationId },
      orderBy: [{ name: "asc" }]
    });
  }
}
