import type { ApprovalStatus } from "@agentready/db";
import type { z } from "zod";
import {
  upsertAgentFeatureFlagSchema,
  upsertApprovalGateSchema
} from "@agentready/shared";
import { HttpError } from "../../lib/httpError.js";
import { toInputJson } from "../../lib/json.js";
import { AuditRepository } from "../audit/auditRepository.js";
import { TenancyService } from "../tenancy/tenancyService.js";
import { GovernanceRepository } from "./governanceRepository.js";

type UpsertApprovalGateInput = z.infer<typeof upsertApprovalGateSchema>;
type UpsertFeatureFlagInput = z.infer<typeof upsertAgentFeatureFlagSchema>;

export class GovernanceService {
  constructor(
    private readonly governance: GovernanceRepository,
    private readonly audit: AuditRepository,
    private readonly tenancy: TenancyService
  ) {}

  listApprovalGates(input: { organizationId: string }) {
    return this.governance.listApprovalGates(input);
  }

  async upsertApprovalGate(input: UpsertApprovalGateInput) {
    const gate = await this.governance.upsertApprovalGate(input);

    await this.audit.create({
      organizationId: input.organizationId,
      actorType: "SYSTEM",
      action: "approval_gate.upserted",
      targetType: "ApprovalGate",
      targetId: gate.id,
      metadata: toInputJson({ capability: input.capability, mode: input.mode })
    });

    return gate;
  }

  listFeatureFlags(input: { organizationId: string }) {
    return this.governance.listFeatureFlags(input);
  }

  async upsertFeatureFlag(input: UpsertFeatureFlagInput) {
    await this.tenancy.requireAgent({
      organizationId: input.organizationId,
      agentId: input.agentId
    });

    const flag = await this.governance.upsertFeatureFlag(input);

    await this.audit.create({
      organizationId: input.organizationId,
      actorType: "SYSTEM",
      action: "feature_flag.upserted",
      targetType: "AgentFeatureFlag",
      targetId: flag.id,
      metadata: toInputJson({
        agentId: input.agentId,
        capability: input.capability,
        state: input.state
      })
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

    await this.audit.create({
      organizationId: approval.organizationId,
      actorType: "USER",
      actorUserId: input.reviewedByUserId,
      action: "approval_request.reviewed",
      targetType: "ApprovalRequest",
      targetId: approval.id,
      metadata: toInputJson({ status: input.status, note: input.note })
    });

    return approval;
  }

  listMcpServers(input: { organizationId: string }) {
    return this.governance.listMcpServers(input);
  }
}
