import type { TaskContractInput } from "@agentready/agent-contracts";
import { HttpError } from "../../lib/httpError.js";
import { toInputJson } from "../../lib/json.js";
import { AuditService } from "../audit/auditService.js";
import { TenancyService } from "../tenancy/tenancyService.js";
import { TaskContractRepository } from "./taskContractRepository.js";
import type { PatchTaskContractBody } from "./taskContractSchemas.js";

export class TaskContractService {
  constructor(
    private readonly contracts: TaskContractRepository,
    private readonly audit: AuditService,
    private readonly tenancy: TenancyService
  ) {}

  list(input: { organizationId: string; projectId?: string }) {
    return this.contracts.list(input);
  }

  async create(input: TaskContractInput & { actorUserId?: string }) {
    await this.tenancy.requireProject({
      organizationId: input.organizationId,
      projectId: input.projectId
    });
    await this.tenancy.requireTask({
      organizationId: input.organizationId,
      taskId: input.taskId
    });
    await this.tenancy.requireAgent({
      organizationId: input.organizationId,
      agentId: input.agentId
    });

    const contract = await this.contracts.create({
      organizationId: input.organizationId,
      projectId: input.projectId,
      taskId: input.taskId,
      agentId: input.agentId,
      name: input.name,
      version: input.version,
      objective: input.objective,
      inputs: toInputJson(input.inputs),
      successCriteria: toInputJson(input.successCriteria),
      allowedTools: input.allowedTools,
      requiredApprovals: input.requiredApprovals,
      evalSpec: toInputJson(input.evalSpec),
      trajectoryPolicy: input.trajectoryPolicy ? toInputJson(input.trajectoryPolicy) : undefined
    });

    await this.audit.record({
      organizationId: input.organizationId,
      source: "HUMAN",
      actorUserId: input.actorUserId,
      action: "task_contract.created",
      resourceType: "TaskContract",
      resourceId: contract.id,
      after: {
        name: contract.name,
        version: contract.version,
        projectId: contract.projectId,
        taskId: contract.taskId,
        agentId: contract.agentId,
        allowedTools: contract.allowedTools,
        requiredApprovals: contract.requiredApprovals,
        trajectoryPolicy: contract.trajectoryPolicy
      }
    });

    return contract;
  }

  async update(input: {
    organizationId: string;
    id: string;
    actorUserId?: string;
    data: PatchTaskContractBody;
  }) {
    const existing = await this.contracts.findById({
      id: input.id,
      organizationId: input.organizationId
    });

    if (!existing) {
      throw new HttpError({
        code: "NOT_FOUND",
        message: "Task contract was not found",
        statusCode: 404
      });
    }

    const updateData: Record<string, any> = {};
    if (input.data.name !== undefined) updateData.name = input.data.name;
    if (input.data.version !== undefined) updateData.version = input.data.version;
    if (input.data.objective !== undefined) updateData.objective = input.data.objective;
    if (input.data.inputs !== undefined) updateData.inputs = toInputJson(input.data.inputs);
    if (input.data.successCriteria !== undefined) updateData.successCriteria = toInputJson(input.data.successCriteria);
    if (input.data.allowedTools !== undefined) updateData.allowedTools = input.data.allowedTools;
    if (input.data.requiredApprovals !== undefined) updateData.requiredApprovals = input.data.requiredApprovals;
    if (input.data.evalSpec !== undefined) updateData.evalSpec = toInputJson(input.data.evalSpec);
    if (input.data.trajectoryPolicy !== undefined) updateData.trajectoryPolicy = toInputJson(input.data.trajectoryPolicy);

    const updated = await this.contracts.update({
      organizationId: input.organizationId,
      id: input.id,
      data: updateData
    });

    await this.audit.record({
      organizationId: input.organizationId,
      source: "HUMAN",
      actorUserId: input.actorUserId,
      action: "task_contract.updated",
      resourceType: "TaskContract",
      resourceId: updated.id,
      before: {
        name: existing.name,
        version: existing.version,
        trajectoryPolicy: existing.trajectoryPolicy,
        allowedTools: existing.allowedTools
      },
      after: {
        name: updated.name,
        version: updated.version,
        trajectoryPolicy: updated.trajectoryPolicy,
        allowedTools: updated.allowedTools
      }
    });

    return updated;
  }

  get(input: { organizationId: string; id: string }) {
    return this.contracts.findById(input);
  }
}
