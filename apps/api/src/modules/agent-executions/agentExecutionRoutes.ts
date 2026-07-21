import type { FastifyInstance } from "fastify";
import { HttpError } from "../../lib/httpError.js";
import { validateBody } from "../../lib/validate.js";
import { AuditRepository } from "../audit/auditRepository.js";
import { GovernanceRepository } from "../governance/governanceRepository.js";
import { AgentExecutionRepository } from "./agentExecutionRepository.js";
import { AgentExecutionService } from "./agentExecutionService.js";
import {
  createExecutionBodySchema,
  createToolCallTraceBodySchema,
  executionListQuerySchema,
  executionParamsSchema,
  executionTenantQuerySchema,
  updateExecutionBodySchema,
  updateToolCallTraceBodySchema
} from "./agentExecutionSchemas.js";

export async function registerAgentExecutionRoutes(app: FastifyInstance) {
  const service = new AgentExecutionService(
    new AgentExecutionRepository(app.prisma),
    new GovernanceRepository(app.prisma),
    new AuditRepository(app.prisma)
  );

  app.get("/executions", async (request) => {
    return service.list(executionListQuerySchema.parse(request.query));
  });

  app.post("/executions", async (request, reply) => {
    const execution = await service.create(validateBody(createExecutionBodySchema, request.body));
    return reply.code(201).send(execution);
  });

  app.get("/executions/:id", async (request) => {
    const params = executionParamsSchema.parse(request.params);
    const query = executionTenantQuerySchema.parse(request.query);
    const execution = await service.get({ id: params.id, organizationId: query.organizationId });

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
    const params = executionParamsSchema.parse(request.params);
    const query = executionTenantQuerySchema.parse(request.query);
    const body = validateBody(updateExecutionBodySchema, request.body);
    return service.transition({ organizationId: query.organizationId, id: params.id, ...body });
  });

  app.post("/tool-call-traces", async (request, reply) => {
    const trace = await service.recordToolCall(validateBody(createToolCallTraceBodySchema, request.body));
    return reply.code(201).send(trace);
  });

  app.patch("/tool-call-traces/:id", async (request) => {
    const params = executionParamsSchema.parse(request.params);
    const query = executionTenantQuerySchema.parse(request.query);
    const body = validateBody(updateToolCallTraceBodySchema, request.body);

    return service.updateToolCallTrace({ organizationId: query.organizationId, id: params.id, ...body });
  });
}
