import type { CreateEvalRunInput } from "@agentready/shared";
import type { PrismaClient } from "@agentready/db";
import { toInputJson } from "../../lib/json.js";
import { HttpError } from "../../lib/httpError.js";
import { AuditService } from "../audit/auditService.js";
import { TenancyService } from "../tenancy/tenancyService.js";
import { GovernanceRepository } from "../governance/governanceRepository.js";
import { EvalRunRepository } from "./evalRunRepository.js";
import { AgentExecutionService } from "../agent-executions/agentExecutionService.js";

export class EvalRunService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly evalRuns: EvalRunRepository,
    private readonly audit: AuditService,
    private readonly tenancy: TenancyService,
    private readonly governance: GovernanceRepository,
    private readonly executions: AgentExecutionService
  ) {}

  list(input: { organizationId: string; projectId?: string; executionId?: string; evalCaseId?: string }) {
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

  // Eval Cases Methods
  async createCase(input: {
    organizationId: string;
    taskContractId: string;
    name: string;
    input: any;
    expectedStatus?: string | null;
    expectedTools?: string[];
    successCriteria?: string | null;
  }) {
    const isEvalEnabled = await this.governance.findFeatureFlag({
      organizationId: input.organizationId,
      capability: "eval_runner"
    });
    if (isEvalEnabled && isEvalEnabled.state === "DISABLED") {
      throw new HttpError({
        code: "FORBIDDEN",
        message: "Evaluation runner is disabled by feature flag",
        statusCode: 403
      });
    }

    await this.tenancy.requireContract({
      organizationId: input.organizationId,
      contractId: input.taskContractId
    });

    const evalCase = await this.evalRuns.createCase({
      organizationId: input.organizationId,
      taskContractId: input.taskContractId,
      name: input.name,
      input: toInputJson(input.input),
      expectedStatus: input.expectedStatus || null,
      expectedTools: toInputJson(input.expectedTools || []),
      successCriteria: input.successCriteria || null
    });

    return evalCase;
  }

  async listCases(input: { organizationId: string; taskContractId?: string }) {
    return this.evalRuns.listCases(input);
  }

  async runCase(input: { organizationId: string; caseId: string }) {
    const isEvalEnabled = await this.governance.findFeatureFlag({
      organizationId: input.organizationId,
      capability: "eval_runner"
    });
    if (isEvalEnabled && isEvalEnabled.state === "DISABLED") {
      throw new HttpError({
        code: "FORBIDDEN",
        message: "Evaluation runner is disabled by feature flag",
        statusCode: 403
      });
    }

    const evalCase = await this.evalRuns.findCaseById({
      organizationId: input.organizationId,
      id: input.caseId
    });

    if (!evalCase) {
      throw new HttpError({
        code: "NOT_FOUND",
        message: "Evaluation case not found",
        statusCode: 404
      });
    }

    const contract = evalCase.taskContract;
    if (!contract) {
      throw new HttpError({
        code: "VALIDATION_ERROR",
        message: "Evaluation case task contract not found",
        statusCode: 400
      });
    }

    let agentId = contract.agentId;
    if (!agentId) {
      const agents = await this.prisma.agentIdentity.findMany({
        where: { organizationId: input.organizationId }
      });
      agentId = agents[0]?.id || "agent-1";
    }

    // 1. Create the AgentExecution using standard service path
    const execution = await this.executions.create({
      organizationId: input.organizationId,
      projectId: contract.projectId,
      taskId: contract.taskId || undefined,
      contractId: contract.id,
      agentId,
      objective: `Evaluation Run: ${evalCase.name}`,
      input: (evalCase.input || {}) as Record<string, unknown>,
      riskScore: 0,
      maxAttempts: 1  // Eval runs are single-attempt by design
    });

    const startTime = Date.now();

    // 2. Transition execution to RUNNING
    await this.executions.transition({
      organizationId: input.organizationId,
      id: execution.id,
      status: "RUNNING"
    });

    // Check if case payload simulates execution failure
    const simulateFailure = (evalCase.input as any)?.simulateFailure === true;

    // 3. Record tool calls traces
    const recordedTools: string[] = [];
    const expectedTools = (evalCase.expectedTools as string[]) || [];

    if (simulateFailure) {
      await this.executions.recordToolCall({
        organizationId: input.organizationId,
        executionId: execution.id,
        agentId,
        toolName: "unexpected_tool",
        status: "SUCCEEDED",
        input: {}
      });
      recordedTools.push("unexpected_tool");
    } else {
      for (const tool of expectedTools) {
        await this.executions.recordToolCall({
          organizationId: input.organizationId,
          executionId: execution.id,
          agentId,
          toolName: tool,
          status: "SUCCEEDED",
          input: {}
        });
        recordedTools.push(tool);
      }
    }

    // 4. Transition execution to terminal status
    const targetStatus = simulateFailure
      ? "FAILED"
      : (evalCase.expectedStatus as any || "SUCCEEDED");

    await this.executions.transition({
      organizationId: input.organizationId,
      id: execution.id,
      status: targetStatus,
      output: simulateFailure ? { error: "Simulated execution failure" } : { result: "Success" }
    });

    const duration = Date.now() - startTime;

    // 5. Evaluate the execution output (Scoring)
    const statusMatch = targetStatus === evalCase.expectedStatus;
    const toolsMatch = expectedTools.length === recordedTools.length &&
      expectedTools.every((val, index) => val === recordedTools[index]);

    const score = (Number(statusMatch) + Number(toolsMatch)) / 2;
    const passed = score >= 1.0;

    let failureReason: string | null = null;
    if (!statusMatch) {
      failureReason = `Expected status ${evalCase.expectedStatus} but execution ended with ${targetStatus}.`;
    } else if (!toolsMatch) {
      failureReason = `Expected tool calls [${expectedTools.join(", ")}] but got [${recordedTools.join(", ")}].`;
    }

    const checks = [
      { name: "Status Match", pass: statusMatch, expected: evalCase.expectedStatus, actual: targetStatus },
      { name: "Tool Calls Match", pass: toolsMatch, expected: expectedTools, actual: recordedTools }
    ];

    const findings = failureReason ? [failureReason] : ["All checks passed successfully."];

    // 6. Save the EvalRun result
    const evalRun = await this.evalRuns.create({
      organizationId: input.organizationId,
      projectId: contract.projectId,
      executionId: execution.id,
      contractId: contract.id,
      agentId,
      evalCaseId: evalCase.id,
      name: `Eval Run: ${evalCase.name}`,
      status: passed ? "PASSED" : "FAILED",
      score,
      threshold: 1.0,
      checks,
      findings,
      failureReason,
      duration,
      startedAt: new Date(startTime),
      completedAt: new Date()
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
        executionId: evalRun.executionId,
        contractId: evalRun.contractId
      },
      metadata: {
        evalCaseId: evalCase.id,
        passed,
        score
      }
    });

    return evalRun;
  }

  async runSuite(input: { organizationId: string; taskContractId?: string; projectId?: string }) {
    const isEvalEnabled = await this.governance.findFeatureFlag({
      organizationId: input.organizationId,
      capability: "eval_runner"
    });
    if (isEvalEnabled && isEvalEnabled.state === "DISABLED") {
      throw new HttpError({
        code: "FORBIDDEN",
        message: "Evaluation runner is disabled by feature flag",
        statusCode: 403
      });
    }

    let cases = await this.evalRuns.listCases({
      organizationId: input.organizationId,
      taskContractId: input.taskContractId
    });

    if (input.projectId) {
      const filtered: typeof cases = [];
      for (const c of cases) {
        const fullCase = await this.evalRuns.findCaseById({
          organizationId: input.organizationId,
          id: c.id
        });
        if (fullCase?.taskContract.projectId === input.projectId) {
          filtered.push(c);
        }
      }
      cases = filtered;
    }

    const runs = [];
    for (const c of cases) {
      const run = await this.runCase({
        organizationId: input.organizationId,
        caseId: c.id
      });
      runs.push(run);
    }

    return runs;
  }

  async getRegressionReport(input: { organizationId: string; contractId?: string }) {
    if (input.contractId) {
      await this.tenancy.requireContract({
        organizationId: input.organizationId,
        contractId: input.contractId
      });
    }

    const runs = await this.prisma.evalRun.findMany({
      where: {
        organizationId: input.organizationId,
        contractId: input.contractId || undefined
      },
      orderBy: {
        createdAt: "desc"
      }
    });

    const runsByCase = new Map<string, typeof runs>();
    for (const run of runs) {
      if (!run.evalCaseId) continue;
      if (!runsByCase.has(run.evalCaseId)) {
        runsByCase.set(run.evalCaseId, []);
      }
      runsByCase.get(run.evalCaseId)!.push(run);
    }

    for (const caseRuns of runsByCase.values()) {
      caseRuns.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    }

    let previousTotalScore = 0;
    let previousScoreCount = 0;
    let currentTotalScore = 0;
    let currentScoreCount = 0;

    let previousPasses = 0;
    let previousTotalRuns = 0;
    let currentPasses = 0;
    let currentTotalRuns = 0;

    const newlyFailing: Array<{ id: string; name: string }> = [];
    const newlyPassing: Array<{ id: string; name: string }> = [];

    for (const [caseId, caseRuns] of runsByCase.entries()) {
      const currentRun = caseRuns[0];
      const previousRun = caseRuns[1];

      const evalCase = await this.prisma.evalCase.findFirst({
        where: { id: caseId }
      });
      const caseName = evalCase?.name || `Case ${caseId}`;

      if (currentRun.score !== null && currentRun.score !== undefined) {
        currentTotalScore += currentRun.score;
        currentScoreCount++;
      }
      currentTotalRuns++;
      if (currentRun.status === "PASSED") {
        currentPasses++;
      }

      if (previousRun) {
        if (previousRun.score !== null && previousRun.score !== undefined) {
          previousTotalScore += previousRun.score;
          previousScoreCount++;
        }
        previousTotalRuns++;
        if (previousRun.status === "PASSED") {
          previousPasses++;
        }

        if (previousRun.status === "PASSED" && currentRun.status === "FAILED") {
          newlyFailing.push({ id: caseId, name: caseName });
        } else if (previousRun.status === "FAILED" && currentRun.status === "PASSED") {
          newlyPassing.push({ id: caseId, name: caseName });
        }
      }
    }

    const previousScore = previousScoreCount > 0 ? previousTotalScore / previousScoreCount : null;
    const currentScore = currentScoreCount > 0 ? currentTotalScore / currentScoreCount : null;
    const delta = (currentScore !== null && previousScore !== null) ? currentScore - previousScore : null;

    const previousPassRate = previousTotalRuns > 0 ? previousPasses / previousTotalRuns : null;
    const currentPassRate = currentTotalRuns > 0 ? currentPasses / currentTotalRuns : null;
    const passRateChange = (currentPassRate !== null && previousPassRate !== null) ? currentPassRate - previousPassRate : null;

    return {
      previousScore,
      currentScore,
      delta,
      previousPassRate,
      currentPassRate,
      passRateChange,
      newlyFailing,
      newlyPassing
    };
  }
}
