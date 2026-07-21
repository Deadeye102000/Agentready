import type { FastifyInstance } from "fastify";
import { validateBody } from "../../lib/validate.js";
import { AuditRepository } from "../audit/auditRepository.js";
import { requireOrgContext } from "../auth/authPlugin.js";
import { TenancyRepository } from "../tenancy/tenancyRepository.js";
import { TenancyService } from "../tenancy/tenancyService.js";
import { GovernanceRepository } from "./governanceRepository.js";
import { GovernanceService } from "./governanceService.js";
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
    new AuditRepository(app.prisma),
    new TenancyService(new TenancyRepository(app.prisma))
  );

  app.get("/approval-gates", async (request) => {
    const context = requireOrgContext(request);
    emptyQuerySchema.parse(request.query);
    return service.listApprovalGates({ organizationId: context.organizationId });
  });

  app.put("/approval-gates", async (request) => {
    const context = requireOrgContext(request);
    const body = validateBody(approvalGateBodySchema, request.body);
    return service.upsertApprovalGate({ ...body, organizationId: context.organizationId });
  });

  app.get("/feature-flags", async (request) => {
    const context = requireOrgContext(request);
    emptyQuerySchema.parse(request.query);
    return service.listFeatureFlags({ organizationId: context.organizationId });
  });

  app.put("/feature-flags", async (request) => {
    const context = requireOrgContext(request);
    const body = validateBody(featureFlagBodySchema, request.body);
    return service.upsertFeatureFlag({ ...body, organizationId: context.organizationId });
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
}
