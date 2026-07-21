import type { ActorType, Prisma } from "@agentready/db";
import { toInputJson } from "../../lib/json.js";
import { AuditRepository } from "./auditRepository.js";

export type AuditSource = "HUMAN" | "AGENT" | "SYSTEM";

const actorTypeBySource: Record<AuditSource, ActorType> = {
  HUMAN: "USER",
  AGENT: "AGENT",
  SYSTEM: "SYSTEM"
};

export class AuditService {
  constructor(private readonly audit: AuditRepository) {}

  record(input: {
    organizationId: string;
    source: AuditSource;
    action: string;
    resourceType: string;
    resourceId?: string;
    actorUserId?: string;
    actorAgentId?: string;
    before?: unknown;
    after?: unknown;
    metadata?: Record<string, unknown>;
  }) {
    return this.audit.create({
      organizationId: input.organizationId,
      actorType: actorTypeBySource[input.source],
      actorUserId: input.actorUserId,
      actorAgentId: input.actorAgentId,
      action: input.action,
      targetType: input.resourceType,
      targetId: input.resourceId,
      metadata: toInputJson({
        source: input.source,
        before: input.before,
        after: input.after,
        ...(input.metadata ?? {})
      }) as Prisma.InputJsonValue
    });
  }

  listRecent(input: { organizationId: string; limit?: number }) {
    return this.audit.listRecent({
      organizationId: input.organizationId,
      limit: Math.min(input.limit ?? 50, 100)
    });
  }
}
