import type { ApprovalStatus, AgentExecutionStatus } from "@agentready/db";
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
import { AgentExecutionRepository } from "../agent-executions/agentExecutionRepository.js";
import { assertExecutionTransition } from "../agent-executions/executionStateMachine.js";

type UpsertApprovalGateInput = z.infer<typeof upsertApprovalGateSchema>;
type UpsertFeatureFlagInput = z.infer<typeof upsertAgentFeatureFlagSchema>;

export class GovernanceService {
  constructor(
    private readonly governance: GovernanceRepository,
    private readonly audit: AuditService,
    private readonly tenancy: TenancyService,
    private readonly executions: AgentExecutionRepository
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
    if (input.agentId) {
      await this.tenancy.requireAgent({
        organizationId: input.organizationId,
        agentId: input.agentId
      });
    }

    const before = await this.governance.findFeatureFlag({
      organizationId: input.organizationId,
      agentId: input.agentId,
      capability: input.capability
    });
    const flag = await this.governance.upsertFeatureFlag({
      ...input,
      agentId: input.agentId ?? null
    });

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
    status: "APPROVED" | "REJECTED" | "EXPIRED";
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

    const payload = existing.payload as any;
    if (payload && typeof payload === "object" && payload.executionId) {
      const executionId = payload.executionId;
      const execution = await this.executions.findById({
        organizationId: input.organizationId,
        id: executionId
      });
      if (execution && execution.status === "WAITING_FOR_APPROVAL") {
        const nextStatus: AgentExecutionStatus = input.status === "APPROVED" ? "RUNNING" : "FAILED";
        const output = input.status === "REJECTED" ? { error: "Execution rejected by user." } : undefined;

        assertExecutionTransition(execution.status, nextStatus);

        await this.executions.updateStatus({
          organizationId: input.organizationId,
          id: executionId,
          status: nextStatus,
          output
        });

        await this.audit.record({
          organizationId: input.organizationId,
          source: "SYSTEM",
          action: "agent_execution.status_changed",
          resourceType: "AgentExecution",
          resourceId: executionId,
          before: { status: execution.status, output: execution.output },
          after: { status: nextStatus, output }
        });
      }
    }

    if (input.status === "REJECTED" || input.status === "EXPIRED") {
      await this.executions.updateTracesForApproval(approval.id, {
        status: "BLOCKED",
        error: input.status === "REJECTED" ? (input.note ?? "Approval rejected by reviewer") : "Approval expired",
        completedAt: new Date()
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

  async listMcpServers(input: { organizationId: string }) {
    const isMcpEnabled = await this.governance.findFeatureFlag({
      organizationId: input.organizationId,
      capability: "mcp_server_access"
    });
    if (isMcpEnabled && isMcpEnabled.state === "DISABLED") {
      throw new HttpError({
        code: "FORBIDDEN",
        message: "MCP server access is disabled by feature flag",
        statusCode: 403
      });
    }
    return this.governance.listMcpServers(input);
  }

  async toggleFeatureFlag(input: {
    organizationId: string;
    agentId?: string | null;
    capability: string;
    actorUserId: string;
  }) {
    if (input.agentId) {
      await this.tenancy.requireAgent({
        organizationId: input.organizationId,
        agentId: input.agentId
      });
    }

    const existing = await this.governance.findFeatureFlag(input);
    const newState = existing && existing.state === "ENABLED" ? "DISABLED" : "ENABLED";

    const flag = await this.governance.upsertFeatureFlag({
      organizationId: input.organizationId,
      agentId: input.agentId ?? null,
      capability: input.capability,
      state: newState
    });

    await this.audit.record({
      organizationId: input.organizationId,
      source: "HUMAN",
      actorUserId: input.actorUserId,
      action: "feature_flag.toggled",
      resourceType: "AgentFeatureFlag",
      resourceId: flag.id,
      before: existing,
      after: flag,
      metadata: { state: newState }
    });

    return flag;
  }
}
