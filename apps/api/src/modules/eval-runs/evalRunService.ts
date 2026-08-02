import type { CreateEvalRunInput } from "@agentready/shared";
import { toInputJson } from "../../lib/json.js";
import { HttpError } from "../../lib/httpError.js";
import { AuditService } from "../audit/auditService.js";
import { TenancyService } from "../tenancy/tenancyService.js";
import { GovernanceRepository } from "../governance/governanceRepository.js";
import { EvalRunRepository } from "./evalRunRepository.js";

export class EvalRunService {
  constructor(
    private readonly evalRuns: EvalRunRepository,
    private readonly audit: AuditService,
    private readonly tenancy: TenancyService,
    private readonly governance: GovernanceRepository
  ) {}

  list(input: { organizationId: string; projectId?: string; executionId?: string }) {
    return this.evalRuns.list(input);
  }

  async create(input: CreateEvalRunInput) {
    const isEvalEnabled = await this.governance.findFeatureFlag({
      organizationId: input.organizationId,
      agentId: input.agentId,
      capability: "eval_runner"
    });
    if (isEvalEnabled && isEvalEnabled.state === "DISABLED") {
      throw new HttpError({
        code: "FORBIDDEN",
        message: "Evaluation runner is disabled by feature flag",
        statusCode: 403
      });
    }

    await this.tenancy.requireProject({
      organizationId: input.organizationId,
      projectId: input.projectId
    });
    await this.tenancy.requireExecution({
      organizationId: input.organizationId,
      executionId: input.executionId
    });
    await this.tenancy.requireContract({
      organizationId: input.organizationId,
      contractId: input.contractId
    });
    await this.tenancy.requireAgent({
      organizationId: input.organizationId,
      agentId: input.agentId
    });

    const finished = ["PASSED", "FAILED", "ERRORED"].includes(input.status);
    const evalRun = await this.evalRuns.create({
      organizationId: input.organizationId,
      projectId: input.projectId,
      executionId: input.executionId,
      contractId: input.contractId,
      agentId: input.agentId,
      name: input.name,
      status: input.status,
      score: input.score,
      threshold: input.threshold,
      checks: toInputJson(input.checks),
      findings: toInputJson(input.findings),
      startedAt: new Date(),
      completedAt: finished ? new Date() : undefined
    });

    await this.audit.record({
      organizationId: input.organizationId,
      source: "SYSTEM",
      action: "eval_run.created",
      resourceType: "EvalRun",
      resourceId: evalRun.id,
      after: {
        status: evalRun.status,
        score: evalRun.score,
        threshold: evalRun.threshold,
        executionId: evalRun.executionId,
        contractId: evalRun.contractId
      },
      metadata: {
        executionId: input.executionId,
        contractId: input.contractId,
        status: input.status,
        score: input.score
      }
    });

    return evalRun;
  }
}
