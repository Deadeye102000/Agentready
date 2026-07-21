import type { FastifyInstance } from "fastify";
import { HttpError } from "../../lib/httpError.js";
import { validateBody } from "../../lib/validate.js";
import { AuditRepository } from "../audit/auditRepository.js";
import { AuditService } from "../audit/auditService.js";
import { requireOrgContext } from "../auth/authPlugin.js";
import { GovernanceRepository } from "../governance/governanceRepository.js";
import { TenancyRepository } from "../tenancy/tenancyRepository.js";
import { TenancyService } from "../tenancy/tenancyService.js";
import { AgentExecutionRepository } from "./agentExecutionRepository.js";
import { AgentExecutionService } from "./agentExecutionService.js";
import {
  createExecutionBodySchema,
  createToolCallTraceBodySchema,
  executionListQuerySchema,
  executionParamsSchema,
  updateExecutionBodySchema,
  updateToolCallTraceBodySchema
} from "./agentExecutionSchemas.js";

export async function registerAgentExecutionRoutes(app: FastifyInstance) {
  const service = new AgentExecutionService(
    new AgentExecutionRepository(app.prisma),
    new GovernanceRepository(app.prisma),
    new AuditService(new AuditRepository(app.prisma)),
    new TenancyService(new TenancyRepository(app.prisma))
  );

  app.get("/executions", async (request) => {
    const context = requireOrgContext(request);
    const query = executionListQuerySchema.parse(request.query);
    return service.list({ ...query, organizationId: context.organizationId });
  });

  app.post("/executions", async (request, reply) => {
    const context = requireOrgContext(request);
    const body = validateBody(createExecutionBodySchema, request.body);
    const execution = await service.create({ ...body, organizationId: context.organizationId });
    return reply.code(201).send(execution);
  });

  app.get("/executions/:id", async (request) => {
    const context = requireOrgContext(request);
    const params = executionParamsSchema.parse(request.params);
    const execution = await service.get({ id: params.id, organizationId: context.organizationId });

    if (!execution) {
      throw new HttpError({
        code: "NOT_FOUND",
        message: "Agent execution was not found",
        statusCode: 404
      });
    }

    return execution;
  });

  app.patch("/executions/:id", async (request) => {
    const context = requireOrgContext(request);
    const params = executionParamsSchema.parse(request.params);
    const body = validateBody(updateExecutionBodySchema, request.body);
    return service.transition({ organizationId: context.organizationId, id: params.id, ...body });
  });

  app.post("/tool-call-traces", async (request, reply) => {
    const context = requireOrgContext(request);
    const body = validateBody(createToolCallTraceBodySchema, request.body);
    const trace = await service.recordToolCall({ ...body, organizationId: context.organizationId });
    return reply.code(201).send(trace);
  });

  app.patch("/tool-call-traces/:id", async (request) => {
    const context = requireOrgContext(request);
    const params = executionParamsSchema.parse(request.params);
    const body = validateBody(updateToolCallTraceBodySchema, request.body);

    return service.updateToolCallTrace({ organizationId: context.organizationId, id: params.id, ...body });
  });
}
