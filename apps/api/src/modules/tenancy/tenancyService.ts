import { HttpError } from "../../lib/httpError.js";
import { TenancyRepository } from "./tenancyRepository.js";

export class TenancyService {
  constructor(private readonly tenancy: TenancyRepository) {}

  async requireProject(input: { organizationId: string; projectId: string }) {
    if (!(await this.tenancy.projectBelongsToOrganization(input))) {
      this.throwForbidden("Project does not belong to this organization");
    }
  }

  async requireTask(input: { organizationId: string; taskId?: string }) {
    if (input.taskId && !(await this.tenancy.taskBelongsToOrganization({ ...input, taskId: input.taskId }))) {
      this.throwForbidden("Task does not belong to this organization");
    }
  }

  async requireAgent(input: { organizationId: string; agentId?: string }) {
    if (input.agentId && !(await this.tenancy.agentBelongsToOrganization({ ...input, agentId: input.agentId }))) {
      this.throwForbidden("Agent does not belong to this organization");
    }
  }

  async requireContract(input: { organizationId: string; contractId?: string }) {
    if (
      input.contractId &&
      !(await this.tenancy.contractBelongsToOrganization({ ...input, contractId: input.contractId }))
    ) {
      this.throwForbidden("Task contract does not belong to this organization");
    }
  }

  async requireExecution(input: { organizationId: string; executionId?: string }) {
    if (
      input.executionId &&
      !(await this.tenancy.executionBelongsToOrganization({ ...input, executionId: input.executionId }))
    ) {
      this.throwForbidden("Agent execution does not belong to this organization");
    }
  }

  private throwForbidden(message: string): never {
    throw new HttpError({
      code: "FORBIDDEN",
      message,
      statusCode: 403
    });
  }
}
