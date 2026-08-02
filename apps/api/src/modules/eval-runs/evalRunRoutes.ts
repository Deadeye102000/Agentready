import type { FastifyInstance } from "fastify";
import { validateBody } from "../../lib/validate.js";
import { AuditRepository } from "../audit/auditRepository.js";
import { AuditService } from "../audit/auditService.js";
import { TenancyRepository } from "../tenancy/tenancyRepository.js";
import { TenancyService } from "../tenancy/tenancyService.js";
import { requireOrgContext } from "../auth/authPlugin.js";
import { GovernanceRepository } from "../governance/governanceRepository.js";
import { AgentExecutionRepository } from "../agent-executions/agentExecutionRepository.js";
import { AgentExecutionService } from "../agent-executions/agentExecutionService.js";
import { EvalRunRepository } from "./evalRunRepository.js";
import { EvalRunService } from "./evalRunService.js";
import {
  createEvalRunBodySchema,
  evalRunListQuerySchema,
  createEvalCaseBodySchema,
  evalCaseListQuerySchema,
  runEvalSuiteBodySchema,
  evalRegressionQuerySchema
} from "./evalRunSchemas.js";

export async function registerEvalRunRoutes(app: FastifyInstance) {
  const auditService = new AuditService(new AuditRepository(app.prisma));
  const tenancyService = new TenancyService(new TenancyRepository(app.prisma));
  const governanceRepo = new GovernanceRepository(app.prisma);
  const executionService = new AgentExecutionService(
    new AgentExecutionRepository(app.prisma),
    governanceRepo,
    auditService,
    tenancyService
  );

  const service = new EvalRunService(
    app.prisma,
    new EvalRunRepository(app.prisma),
    auditService,
    tenancyService,
    governanceRepo,
    executionService
  );

  // Eval Runs
  app.get("/eval-runs", async (request) => {
    const context = requireOrgContext(request);
    const query = evalRunListQuerySchema.parse(request.query);
    return service.list({ ...query, organizationId: context.organizationId });
  });

  app.get("/eval-runs/regression", async (request) => {
    const context = requireOrgContext(request);
    const query = evalRegressionQuerySchema.parse(request.query);
    return service.getRegressionReport({
      organizationId: context.organizationId,
      contractId: query.contractId
    });
  });

  app.post("/eval-runs", async (request, reply) => {
    const context = requireOrgContext(request);
    const body = validateBody(createEvalRunBodySchema, request.body);
    const evalRun = await service.create({ ...body, organizationId: context.organizationId });
    return reply.code(201).send(evalRun);
  });

  // Eval Cases
  app.post("/eval-cases", async (request, reply) => {
    const context = requireOrgContext(request);
    const body = validateBody(createEvalCaseBodySchema, request.body);
    const evalCase = await service.createCase({ ...body, organizationId: context.organizationId });
    return reply.code(201).send(evalCase);
  });

  app.get("/eval-cases", async (request) => {
    const context = requireOrgContext(request);
    const query = evalCaseListQuerySchema.parse(request.query);
    return service.listCases({ ...query, organizationId: context.organizationId });
  });

  app.post("/eval-cases/:id/run", async (request, reply) => {
    const context = requireOrgContext(request);
    const params = request.params as { id: string };
    const evalRun = await service.runCase({
      organizationId: context.organizationId,
      caseId: params.id
    });
    return reply.code(200).send(evalRun);
  });

  app.post("/eval-suites/run", async (request, reply) => {
    const context = requireOrgContext(request);
    const body = validateBody(runEvalSuiteBodySchema, request.body);
    const runs = await service.runSuite({
      ...body,
      organizationId: context.organizationId
    });
    return reply.code(200).send(runs);
  });
}
