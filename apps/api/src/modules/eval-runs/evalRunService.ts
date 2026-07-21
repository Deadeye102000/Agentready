import type { CreateEvalRunInput } from "@agentready/shared";
import { toInputJson } from "../../lib/json.js";
import { AuditRepository } from "../audit/auditRepository.js";
import { EvalRunRepository } from "./evalRunRepository.js";

export class EvalRunService {
  constructor(
    private readonly evalRuns: EvalRunRepository,
    private readonly audit: AuditRepository
  ) {}

  list(input: { organizationId: string; projectId?: string; executionId?: string }) {
    return this.evalRuns.list(input);
  }

  async create(input: CreateEvalRunInput) {
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

    await this.audit.create({
      organizationId: input.organizationId,
      actorType: "SYSTEM",
      action: "eval_run.created",
      targetType: "EvalRun",
      targetId: evalRun.id,
      metadata: toInputJson({
        executionId: input.executionId,
        contractId: input.contractId,
        status: input.status,
        score: input.score
      })
    });

    return evalRun;
  }
}
