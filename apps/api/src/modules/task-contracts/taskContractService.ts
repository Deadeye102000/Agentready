import type { TaskContractInput } from "@agentready/agent-contracts";
import { toInputJson } from "../../lib/json.js";
import { AuditRepository } from "../audit/auditRepository.js";
import { TaskContractRepository } from "./taskContractRepository.js";

export class TaskContractService {
  constructor(
    private readonly contracts: TaskContractRepository,
    private readonly audit: AuditRepository
  ) {}

  list(input: { organizationId: string; projectId?: string }) {
    return this.contracts.list(input);
  }

  async create(input: TaskContractInput) {
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

    await this.audit.create({
      organizationId: input.organizationId,
      actorType: "SYSTEM",
      action: "task_contract.created",
      targetType: "TaskContract",
      targetId: contract.id,
      metadata: toInputJson({ name: contract.name, version: contract.version })
    });

    return contract;
  }

  get(input: { organizationId: string; id: string }) {
    return this.contracts.findById(input);
  }
}
