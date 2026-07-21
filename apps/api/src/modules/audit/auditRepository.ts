import type { ActorType, Prisma, PrismaClient } from "@agentready/db";

export class AuditRepository {
  constructor(private readonly prisma: PrismaClient) {}

  create(input: {
    organizationId: string;
    actorType: ActorType;
    action: string;
    targetType: string;
    actorUserId?: string;
    actorAgentId?: string;
    targetId?: string;
    metadata?: Prisma.InputJsonValue;
  }) {
    return this.prisma.auditLog.create({
      data: {
        organizationId: input.organizationId,
        actorType: input.actorType,
        actorUserId: input.actorUserId,
        actorAgentId: input.actorAgentId,
        action: input.action,
        targetType: input.targetType,
        targetId: input.targetId,
        metadata: input.metadata ?? {}
      }
    });
  }

  listRecent(input: { organizationId: string; limit: number }) {
    return this.prisma.auditLog.findMany({
      where: { organizationId: input.organizationId },
      include: {
        actorUser: { select: { id: true, email: true, name: true } },
        actorAgent: { select: { id: true, name: true } }
      },
      orderBy: { createdAt: "desc" },
      take: input.limit
    });
  }
}
