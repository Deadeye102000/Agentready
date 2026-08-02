import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { validateBody } from "../../lib/validate.js";
import { AuditRepository } from "../audit/auditRepository.js";
import { AuditService } from "../audit/auditService.js";
import { requireOrgContext } from "../auth/authPlugin.js";
import { TenancyRepository } from "../tenancy/tenancyRepository.js";
import { TenancyService } from "../tenancy/tenancyService.js";
import { GovernanceRepository } from "./governanceRepository.js";
import { GovernanceService } from "./governanceService.js";
import { AgentExecutionRepository } from "../agent-executions/agentExecutionRepository.js";
import {
  approvalGateBodySchema,
  approvalRequestListQuerySchema,
  approvalRequestParamsSchema,
  emptyQuerySchema,
  featureFlagBodySchema,
  reviewApprovalRequestBodySchema
} from "./governanceSchemas.js";

export async function registerGovernanceRoutes(app: FastifyInstance) {
  const service = new GovernanceService(
    new GovernanceRepository(app.prisma),
    new AuditService(new AuditRepository(app.prisma)),
    new TenancyService(new TenancyRepository(app.prisma)),
    new AgentExecutionRepository(app.prisma)
  );

  app.get("/approval-gates", async (request) => {
    const context = requireOrgContext(request);
    emptyQuerySchema.parse(request.query);
    return service.listApprovalGates({ organizationId: context.organizationId });
  });

  app.put("/approval-gates", async (request) => {
    const context = requireOrgContext(request);
    const body = validateBody(approvalGateBodySchema, request.body);
    return service.upsertApprovalGate({
      ...body,
      organizationId: context.organizationId,
      actorUserId: context.userId
    });
  });

  app.get("/feature-flags", async (request) => {
    const context = requireOrgContext(request);
    emptyQuerySchema.parse(request.query);
    return service.listFeatureFlags({ organizationId: context.organizationId });
  });

  app.put("/feature-flags", async (request) => {
    const context = requireOrgContext(request);
    const body = validateBody(featureFlagBodySchema, request.body);
    return service.upsertFeatureFlag({
      ...body,
      organizationId: context.organizationId,
      actorUserId: context.userId
    });
  });

  app.get("/approval-requests", async (request) => {
    const context = requireOrgContext(request);
    const query = approvalRequestListQuerySchema.parse(request.query);
    return service.listApprovalRequests({ ...query, organizationId: context.organizationId });
  });

  app.post("/approval-requests/:id/review", async (request) => {
    const context = requireOrgContext(request);
    const params = approvalRequestParamsSchema.parse(request.params);
    const body = validateBody(reviewApprovalRequestBodySchema, request.body);

    return service.reviewApprovalRequest({
      id: params.id,
      ...body,
      organizationId: context.organizationId,
      reviewedByUserId: context.userId
    });
  });

  app.get("/mcp-servers", async (request) => {
    const context = requireOrgContext(request);
    emptyQuerySchema.parse(request.query);
    return service.listMcpServers({ organizationId: context.organizationId });
  });

  app.post("/feature-flags/toggle", async (request) => {
    const context = requireOrgContext(request);
    const body = z.object({
      agentId: z.string().nullable().optional(),
      capability: z.string().min(1)
    }).parse(request.body);

    return service.toggleFeatureFlag({
      ...body,
      organizationId: context.organizationId,
      actorUserId: context.userId
    });
  });
}
