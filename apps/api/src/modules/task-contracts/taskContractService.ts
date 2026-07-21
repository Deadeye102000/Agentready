import type { TaskContractInput } from "@agentready/agent-contracts";
import { toInputJson } from "../../lib/json.js";
import { AuditService } from "../audit/auditService.js";
import { TenancyService } from "../tenancy/tenancyService.js";
import { TaskContractRepository } from "./taskContractRepository.js";

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
      evalSpec: toInputJson(input.evalSpec)
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
        requiredApprovals: contract.requiredApprovals
      }
    });

    return contract;
  }

  get(input: { organizationId: string; id: string }) {
    return this.contracts.findById(input);
  }
}
