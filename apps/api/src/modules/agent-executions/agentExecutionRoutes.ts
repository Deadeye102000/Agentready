/**
 * Agent Execution Routes
 *
 * These routes are intentionally thin — they parse input, enforce auth context,
 * and delegate entirely to AgentExecutionService and ExecutionRunner.
 *
 * Worker-readiness pattern (POST /executions):
 *   1. service.create()   → validates governance, persists QUEUED record
 *   2. runner.enqueue()   → hands work off to the ExecutionRunner boundary
 *   3. reply 201          → response is sent immediately; work runs in background
 *
 * TODO(WORKER-READY): To switch to a queue-based worker, replace the
 * InProcessExecutionRunner binding with a QueuedExecutionRunner that pushes
 * ExecutionContext to a job queue. No other route changes are required.
 */

import type { FastifyInstance } from "fastify";
import { HttpError } from "../../lib/httpError.js";
import { validateBody } from "../../lib/validate.js";
import { AuditRepository } from "../audit/auditRepository.js";
import { AuditService } from "../audit/auditService.js";
import { requireOrgContext } from "../auth/authPlugin.js";
import { requireMachineAuth } from "../auth/machineAuthPlugin.js";
import { requireScope } from "../auth/scopes.js";
import { GovernanceRepository } from "../governance/governanceRepository.js";
import { TenancyRepository } from "../tenancy/tenancyRepository.js";
import { TenancyService } from "../tenancy/tenancyService.js";
import { AgentExecutionRepository } from "./agentExecutionRepository.js";
import { AgentExecutionService } from "./agentExecutionService.js";
import { InProcessExecutionRunner } from "./inProcessRunner.js";
import {
  checkToolCallBodySchema,
  createExecutionBodySchema,
  createToolCallTraceBodySchema,
  executionListQuerySchema,
  executionParamsSchema,
  reportToolCallResultBodySchema,
  toolCallTraceParamsSchema,
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

  // TODO(WORKER-READY): To move execution off the API process, replace this
  // binding with: const runner = new QueuedExecutionRunner(jobQueue);
  // The QueuedExecutionRunner.enqueue() pushes to BullMQ / SQS / pg-boss.
  const runner = new InProcessExecutionRunner(service);

  app.get("/executions", {
    preHandler: [requireScope("executions:read")]
  }, async (request) => {
    const context = requireOrgContext(request);
    const query = executionListQuerySchema.parse(request.query);
    return service.list({ ...query, organizationId: context.organizationId });
  });

  app.post("/executions", {
    preHandler: [requireScope("executions:write")]
  }, async (request, reply) => {
    const context = requireOrgContext(request);
    const body = validateBody(createExecutionBodySchema, request.body);

    const execution = await service.create({
      ...body,
      organizationId: context.organizationId
    });

    runner.enqueue({
      id: execution.id,
      organizationId: execution.organizationId,
      agentId: execution.agentId,
      timeoutMs: execution.timeoutMs ?? undefined,
      maxAttempts: execution.maxAttempts,
      attemptCount: execution.attemptCount
    });

    return reply.code(201).send(execution);
  });

  app.get("/executions/:id", {
    preHandler: [requireScope("executions:read")]
  }, async (request) => {
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

  app.patch("/executions/:id", {
    preHandler: [requireScope("executions:write")]
  }, async (request) => {
    const context = requireOrgContext(request);
    const params = executionParamsSchema.parse(request.params);
    const body = validateBody(updateExecutionBodySchema, request.body);
    return service.transition({ organizationId: context.organizationId, id: params.id, ...body });
  });

  app.post("/executions/:id/tool-calls/check", {
    preHandler: [requireScope("tool_calls:check")]
  }, async (request) => {
    const context = requireOrgContext(request);
    const params = executionParamsSchema.parse(request.params);
    const body = validateBody(checkToolCallBodySchema, request.body);
    const idempotencyHeader = request.headers["idempotency-key"] as string | undefined;

    return service.checkToolCall({
      organizationId: context.organizationId,
      executionId: params.id,
      toolName: body.toolName,
      arguments: body.arguments,
      idempotencyKey: idempotencyHeader || body.idempotencyKey,
      actorAgentId: context.agentId,
      actorUserId: context.userId
    });
  });

  app.post("/tool-calls/:traceId/result", {
    preHandler: [requireMachineAuth, requireScope("tool_calls:result")]
  }, async (request) => {
    const context = requireOrgContext(request);
    const params = toolCallTraceParamsSchema.parse(request.params);
    const body = validateBody(reportToolCallResultBodySchema, request.body);

    return service.reportToolCallResult({
      organizationId: context.organizationId,
      traceId: params.traceId,
      status: body.status,
      output: body.output,
      error: body.error,
      latencyMs: body.latencyMs,
      isFinalAction: body.isFinalAction,
      actorAgentId: context.agentId
    });
  });

  app.post("/tool-call-traces", {
    preHandler: [requireScope(["executions:write", "traces:write"])]
  }, async (request, reply) => {
    const context = requireOrgContext(request);
    const body = validateBody(createToolCallTraceBodySchema, request.body);
    const trace = await service.recordToolCall({ ...body, organizationId: context.organizationId });
    return reply.code(201).send(trace);
  });

  app.patch("/tool-call-traces/:id", {
    preHandler: [requireScope(["executions:write", "traces:write"])]
  }, async (request) => {
    const context = requireOrgContext(request);
    const params = executionParamsSchema.parse(request.params);
    const body = validateBody(updateToolCallTraceBodySchema, request.body);

    return service.updateToolCallTrace({ organizationId: context.organizationId, id: params.id, ...body });
  });
}
