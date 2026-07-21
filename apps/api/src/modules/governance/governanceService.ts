import type { ApprovalStatus } from "@agentready/db";
import type { z } from "zod";
import {
  upsertAgentFeatureFlagSchema,
  upsertApprovalGateSchema
} from "@agentready/shared";
import { HttpError } from "../../lib/httpError.js";
import { AuditRepository } from "../audit/auditRepository.js";
import { AuditService } from "../audit/auditService.js";
import { TenancyService } from "../tenancy/tenancyService.js";
import { GovernanceRepository } from "./governanceRepository.js";

type UpsertApprovalGateInput = z.infer<typeof upsertApprovalGateSchema>;
type UpsertFeatureFlagInput = z.infer<typeof upsertAgentFeatureFlagSchema>;

export class GovernanceService {
  constructor(
    private readonly governance: GovernanceRepository,
    private readonly audit: AuditService,
    private readonly tenancy: TenancyService
  ) {}

  listApprovalGates(input: { organizationId: string }) {
    return this.governance.listApprovalGates(input);
  }

  async upsertApprovalGate(input: UpsertApprovalGateInput & { actorUserId?: string }) {
    const before = await this.governance.findApprovalGate({
      organizationId: input.organizationId,
      capability: input.capability
    });
    const gate = await this.governance.upsertApprovalGate(input);

    await this.audit.record({
      organizationId: input.organizationId,
      source: "HUMAN",
      actorUserId: input.actorUserId,
      action: "approval_gate.upserted",
      resourceType: "ApprovalGate",
      resourceId: gate.id,
      before,
      after: gate,
      metadata: { capability: input.capability, mode: input.mode }
    });

    return gate;
  }

  listFeatureFlags(input: { organizationId: string }) {
    return this.governance.listFeatureFlags(input);
  }

  async upsertFeatureFlag(input: UpsertFeatureFlagInput & { actorUserId?: string }) {
    await this.tenancy.requireAgent({
      organizationId: input.organizationId,
      agentId: input.agentId
    });

    const before = await this.governance.findFeatureFlag({
      organizationId: input.organizationId,
      agentId: input.agentId,
      capability: input.capability
    });
    const flag = await this.governance.upsertFeatureFlag(input);

    await this.audit.record({
      organizationId: input.organizationId,
      source: "HUMAN",
      actorUserId: input.actorUserId,
      action: "feature_flag.upserted",
      resourceType: "AgentFeatureFlag",
      resourceId: flag.id,
      before,
      after: flag,
      metadata: {
        agentId: input.agentId,
        capability: input.capability,
        state: input.state
      }
    });

    return flag;
  }

  listApprovalRequests(input: { organizationId: string; status?: ApprovalStatus }) {
    return this.governance.listApprovalRequests(input);
  }

  async reviewApprovalRequest(input: {
    organizationId: string;
    id: string;
    status: "APPROVED" | "REJECTED";
    reviewedByUserId: string;
    note?: string;
  }) {
    const existing = await this.governance.findApprovalRequest({
      organizationId: input.organizationId,
      id: input.id
    });
    if (!existing) {
      throw new HttpError({
        code: "NOT_FOUND",
        message: "Approval request was not found for this organization",
        statusCode: 404
      });
    }

    const approval = await this.governance.reviewApprovalRequest(input);
    if (!approval) {
      throw new HttpError({
        code: "NOT_FOUND",
        message: "Approval request was not found for this organization",
        statusCode: 404
      });
    }

    await this.audit.record({
      organizationId: approval.organizationId,
      source: "HUMAN",
      actorUserId: input.reviewedByUserId,
      action: "approval_request.reviewed",
      resourceType: "ApprovalRequest",
      resourceId: approval.id,
      before: existing,
      after: approval,
      metadata: { status: input.status, note: input.note }
    });

    return approval;
  }

  listMcpServers(input: { organizationId: string }) {
    return this.governance.listMcpServers(input);
  }
}
