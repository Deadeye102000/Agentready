import type { FastifyInstance } from "fastify";
import { HttpError } from "../../lib/httpError.js";
import { validateBody } from "../../lib/validate.js";
import { requireRole } from "../auth/rbac.js";
import { requireScope } from "../auth/scopes.js";
import type { GovernanceService } from "./governanceService.js";
import {
  approvalGateBodySchema,
  approvalRequestListQuerySchema,
  approvalRequestParamsSchema,
  emptyQuerySchema,
  reviewApprovalRequestBodySchema
} from "./governanceSchemas.js";

export async function registerApprovalRoutes(app: FastifyInstance, service: GovernanceService) {
  app.get("/approval-gates", {
    preHandler: [requireScope("governance:read")]
  }, async (request) => {
    const context = request.authContext!;
    emptyQuerySchema.parse(request.query);
    return service.listApprovalGates({ organizationId: context.organizationId });
  });

  app.put("/approval-gates", {
    preHandler: [requireRole(["OWNER", "ADMIN"])]
  }, async (request) => {
    const context = request.authContext!;
    const body = validateBody(approvalGateBodySchema, request.body);
    return service.upsertApprovalGate({
      ...body,
      organizationId: context.organizationId,
      actorUserId: context.userId
    });
  });

  app.get("/approval-requests", {
    preHandler: [requireScope("governance:read")]
  }, async (request) => {
    const context = request.authContext!;
    const query = approvalRequestListQuerySchema.parse(request.query);
    return service.listApprovalRequests({ ...query, organizationId: context.organizationId });
  });

  app.post("/approval-requests/:id/review", {
    preHandler: [requireRole(["OWNER", "ADMIN", "APPROVER"])]
  }, async (request) => {
    const context = request.authContext!;
    if (!context.userId) {
      throw new HttpError({
        code: "UNAUTHORIZED",
        message: "A human user session is required to review approvals",
        statusCode: 401
      });
    }

    const params = approvalRequestParamsSchema.parse(request.params);
    const body = validateBody(reviewApprovalRequestBodySchema, request.body);

    return service.reviewApprovalRequest({
      id: params.id,
      ...body,
      organizationId: context.organizationId,
      reviewedByUserId: context.userId
    });
  });
}
