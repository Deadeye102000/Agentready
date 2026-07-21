import type { FastifyInstance } from "fastify";
import { validateBody } from "../../lib/validate.js";
import { AuditRepository } from "../audit/auditRepository.js";
import { GovernanceRepository } from "./governanceRepository.js";
import { GovernanceService } from "./governanceService.js";
import {
  approvalGateBodySchema,
  approvalRequestListQuerySchema,
  approvalRequestParamsSchema,
  featureFlagBodySchema,
  organizationQuerySchema,
  reviewApprovalRequestBodySchema
} from "./governanceSchemas.js";

export async function registerGovernanceRoutes(app: FastifyInstance) {
  const service = new GovernanceService(
    new GovernanceRepository(app.prisma),
    new AuditRepository(app.prisma)
  );

  app.get("/approval-gates", async (request) => {
    return service.listApprovalGates(organizationQuerySchema.parse(request.query));
  });

  app.put("/approval-gates", async (request) => {
    return service.upsertApprovalGate(validateBody(approvalGateBodySchema, request.body));
  });

  app.get("/feature-flags", async (request) => {
    return service.listFeatureFlags(organizationQuerySchema.parse(request.query));
  });

  app.put("/feature-flags", async (request) => {
    return service.upsertFeatureFlag(validateBody(featureFlagBodySchema, request.body));
  });

  app.get("/approval-requests", async (request) => {
    return service.listApprovalRequests(approvalRequestListQuerySchema.parse(request.query));
  });

  app.post("/approval-requests/:id/review", async (request) => {
    const params = approvalRequestParamsSchema.parse(request.params);
    const body = validateBody(reviewApprovalRequestBodySchema, request.body);

    return service.reviewApprovalRequest({ id: params.id, ...body });
  });

  app.get("/mcp-servers", async (request) => {
    return service.listMcpServers(organizationQuerySchema.parse(request.query));
  });
}
