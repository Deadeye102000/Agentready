import type { AgentExecutionStatus, ToolCallStatus } from "@agentready/db";
import {
  CreateAgentExecutionInput,
  CreateToolCallTraceInput,
  matchPattern
} from "@agentready/shared";
import { HttpError } from "../../lib/httpError.js";
import { toInputJson } from "../../lib/json.js";
import { AuditService } from "../audit/auditService.js";
import { GovernanceRepository } from "../governance/governanceRepository.js";
import { TenancyService } from "../tenancy/tenancyService.js";
import { AgentExecutionRepository } from "./agentExecutionRepository.js";
import {
  assertExecutionTransition,
  isTerminalExecutionStatus
} from "./executionStateMachine.js";

export class AgentExecutionService {
  constructor(
    private readonly executions: AgentExecutionRepository,
    private readonly governance: GovernanceRepository,
    private readonly audit: AuditService,
    private readonly tenancy: TenancyService
  ) {}

  list(input: { organizationId: string; projectId?: string; status?: AgentExecutionStatus }) {
    return this.executions.list(input);
  }

  async create(input: CreateAgentExecutionInput) {
    await this.tenancy.requireProject({
      organizationId: input.organizationId,
      projectId: input.projectId
    });
    await this.tenancy.requireTask({
      organizationId: input.organizationId,
      taskId: input.taskId
    });
    await this.tenancy.requireContract({
      organizationId: input.organizationId,
      contractId: input.contractId
    });
    const isExecutionEnabled = await this.governance.findFeatureFlag({
      organizationId: input.organizationId,
      agentId: input.agentId,
      capability: "agent_execution"
    });
    if (isExecutionEnabled && isExecutionEnabled.state === "DISABLED") {
      throw new HttpError({
        code: "FORBIDDEN",
        message: "Agent execution is disabled by feature flag",
        statusCode: 403
      });
    }

    await this.tenancy.requireAgent({
      organizationId: input.organizationId,
      agentId: input.agentId
    });

    const execution = await this.executions.create({
      organizationId: input.organizationId,
      projectId: input.projectId,
      taskId: input.taskId,
      contractId: input.contractId,
      agentId: input.agentId,
      status: "QUEUED",
      objective: input.objective,
      input: toInputJson(input.input),
      riskScore: input.riskScore
    });

    await this.audit.record({
      organizationId: input.organizationId,
      source: "AGENT",
      actorAgentId: input.agentId,
      action: "agent_execution.created",
      resourceType: "AgentExecution",
      resourceId: execution.id,
      after: {
        status: execution.status,
        objective: execution.objective,
        riskScore: execution.riskScore,
        projectId: execution.projectId,
        contractId: input.contractId,
        taskId: input.taskId
      },
      metadata: {
        workerReady: true
      }
    });

    return execution;
  }

  get(input: { organizationId: string; id: string }) {
    return this.executions.findById(input);
  }

  async transition(input: {
    organizationId: string;
    id: string;
    status: AgentExecutionStatus;
    output?: unknown;
    completedAt?: Date;
  }) {
    const existing = await this.executions.findById({
      organizationId: input.organizationId,
      id: input.id
    });
    if (!existing) {
      throw new HttpError({
        code: "NOT_FOUND",
        message: "Agent execution was not found",
        statusCode: 404
      });
    }

    assertExecutionTransition(existing.status, input.status);

    const now = new Date();
    const execution = await this.executions.updateStatus({
      organizationId: input.organizationId,
      id: input.id,
      status: input.status,
      output: input.output === undefined ? undefined : toInputJson(input.output),
      startedAt: existing.startedAt ?? (input.status === "RUNNING" ? now : undefined),
      completedAt: input.completedAt ?? (isTerminalExecutionStatus(input.status) ? now : undefined)
    });
    if (!execution) {
      throw new HttpError({
        code: "NOT_FOUND",
        message: "Agent execution was not found",
        statusCode: 404
      });
    }

    await this.audit.record({
      organizationId: execution.organizationId,
      source: "AGENT",
      actorAgentId: execution.agentId,
      action: "agent_execution.status_changed",
      resourceType: "AgentExecution",
      resourceId: execution.id,
      before: {
        status: existing.status,
        output: existing.output,
        completedAt: existing.completedAt
      },
      after: {
        status: execution.status,
        output: execution.output,
        completedAt: execution.completedAt
      }
    });

    return execution;
  }

  async recordToolCall(input: CreateToolCallTraceInput) {
    await this.tenancy.requireAgent({
      organizationId: input.organizationId,
      agentId: input.agentId
    });

    const execution = await this.executions.findById({
      organizationId: input.organizationId,
      id: input.executionId
    });
    if (!execution) {
      throw new HttpError({
        code: "NOT_FOUND",
        message: "Agent execution was not found for this organization",
        statusCode: 404
      });
    }

    const featureFlag = await this.governance.findFeatureFlag({
      organizationId: input.organizationId,
      agentId: input.agentId,
      capability: input.toolName
    });
    const globalToolFlag = await this.governance.findFeatureFlag({
      organizationId: input.organizationId,
      agentId: input.agentId,
      capability: "tool_execution"
    });
    const autoApprovalFlag = await this.governance.findFeatureFlag({
      organizationId: input.organizationId,
      agentId: input.agentId,
      capability: "auto_approval"
    });

    const isToolDisabled = (featureFlag && featureFlag.state === "DISABLED") || (globalToolFlag && globalToolFlag.state === "DISABLED");
    const isAutoApprovalDisabled = autoApprovalFlag && autoApprovalFlag.state === "DISABLED";

    const gates = await this.governance.listApprovalGates({
      organizationId: input.organizationId
    });

    const matchingGates = gates.filter(
      (g) => g.enabled && matchPattern(g.capability, input.toolName)
    );
    matchingGates.sort((a, b) => b.capability.length - a.capability.length);
    const gate = matchingGates[0];

    let status: ToolCallStatus = input.status;
    let error = input.error;
    let approvalRequestId = input.approvalRequestId;

    const gateTriggers = gate && execution.riskScore >= gate.riskLevel;

    let effectiveMode = gate?.mode;
    if (effectiveMode === "AUTOMATIC" && isAutoApprovalDisabled) {
      effectiveMode = "REQUIRE_APPROVAL";
    }

    if (isToolDisabled) {
      status = "BLOCKED";
      error = `Capability ${input.toolName} is disabled for this agent by feature flag.`;

      if (execution.status === "RUNNING") {
        await this.transition({
          organizationId: input.organizationId,
          id: execution.id,
          status: "FAILED",
          output: { error: `Execution blocked: Capability ${input.toolName} is disabled by feature flag.` }
        });
      }
    } else if (gateTriggers && effectiveMode === "BLOCKED") {
      status = "BLOCKED";
      error = gate.reason ?? `Capability ${input.toolName} is blocked by policy.`;
    } else if (gateTriggers && effectiveMode === "REQUIRE_APPROVAL" && status !== "BLOCKED") {
      const approval = await this.governance.createApprovalRequest({
        organizationId: input.organizationId,
        agentId: input.agentId,
        requestedAction: input.toolName,
        reason: gate.reason ?? `Capability ${input.toolName} requires approval.`,
        payload: toInputJson({
          executionId: input.executionId,
          toolName: input.toolName,
          input: input.input
        }),
        status: "PENDING"
      });
      approvalRequestId = approval.id;
      status = "BLOCKED";
      error = "approval_requested";

      if (execution.status === "RUNNING") {
        await this.transition({
          organizationId: input.organizationId,
          id: execution.id,
          status: "WAITING_FOR_APPROVAL"
        });
      }
    }

    const completed = ["SUCCEEDED", "FAILED", "BLOCKED"].includes(status);
    const trace = await this.executions.createTrace({
      organizationId: input.organizationId,
      executionId: input.executionId,
      agentId: input.agentId,
      toolName: input.toolName,
      status,
      input: toInputJson(input.input),
      output: input.output === undefined ? undefined : toInputJson(input.output),
      error,
      latencyMs: input.latencyMs,
      approvalRequestId,
      completedAt: completed ? new Date() : undefined
    });

    await this.audit.record({
      organizationId: input.organizationId,
      source: "AGENT",
      actorAgentId: input.agentId,
      action: "tool_call_trace.recorded",
      resourceType: "ToolCallTrace",
      resourceId: trace.id,
      after: {
        status: trace.status,
        toolName: trace.toolName,
        latencyMs: trace.latencyMs,
        approvalRequestId: trace.approvalRequestId,
        error: trace.error
      },
      metadata: {
        executionId: input.executionId,
        toolName: input.toolName
      }
    });

    return trace;
  }

  updateToolCallTrace(input: {
    organizationId: string;
    id: string;
    status: ToolCallStatus;
    output?: unknown;
    error?: string;
    latencyMs?: number;
  }) {
    return this.updateTenantScopedToolCallTrace(input);
  }

  private async updateTenantScopedToolCallTrace(input: {
    organizationId: string;
    id: string;
    status: ToolCallStatus;
    output?: unknown;
    error?: string;
    latencyMs?: number;
  }) {
    const existing = await this.executions.findTraceById({
      organizationId: input.organizationId,
      id: input.id
    });
    if (!existing) {
      throw new HttpError({
        code: "NOT_FOUND",
        message: "Tool-call trace was not found for this organization",
        statusCode: 404
      });
    }

    const trace = await this.executions.updateTrace({
      organizationId: input.organizationId,
      id: input.id,
      status: input.status,
      output: input.output === undefined ? undefined : toInputJson(input.output),
      error: input.error,
      latencyMs: input.latencyMs,
      completedAt: ["SUCCEEDED", "FAILED", "BLOCKED"].includes(input.status) ? new Date() : undefined
    });
    if (!trace) {
      throw new HttpError({
        code: "NOT_FOUND",
        message: "Tool-call trace was not found for this organization",
        statusCode: 404
      });
    }

    await this.audit.record({
      organizationId: input.organizationId,
      source: "AGENT",
      actorAgentId: existing.agentId,
      action: "tool_call_trace.updated",
      resourceType: "ToolCallTrace",
      resourceId: trace.id,
      before: {
        status: existing.status,
        output: existing.output,
        error: existing.error,
        latencyMs: existing.latencyMs,
        completedAt: existing.completedAt
      },
      after: {
        status: trace.status,
        output: trace.output,
        error: trace.error,
        latencyMs: trace.latencyMs,
        completedAt: trace.completedAt
      }
    });

    return trace;
  }
}
