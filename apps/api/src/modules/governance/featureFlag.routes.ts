import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { HttpError } from "../../lib/httpError.js";
import { validateBody } from "../../lib/validate.js";
import { requireRole } from "../auth/rbac.js";
import type { GovernanceService } from "./governanceService.js";
import { featureFlagBodySchema } from "./governanceSchemas.js";

export async function registerFeatureFlagRoutes(app: FastifyInstance, service: GovernanceService) {
  app.get("/feature-flags", async (request) => {
    const context = request.authContext!;
    return service.listFeatureFlags({ organizationId: context.organizationId });
  });

  app.put("/feature-flags", {
    preHandler: [requireRole(["OWNER", "ADMIN"])]
  }, async (request) => {
    const context = request.authContext!;
    const body = validateBody(featureFlagBodySchema, request.body);
    return service.upsertFeatureFlag({
      ...body,
      organizationId: context.organizationId,
      actorUserId: context.userId
    });
  });

  app.post("/feature-flags/toggle", {
    preHandler: [requireRole(["OWNER", "ADMIN"])]
  }, async (request) => {
    const context = request.authContext!;
    if (!context.userId) {
      throw new HttpError({
        code: "UNAUTHORIZED",
        message: "A human user session is required to toggle feature flags",
        statusCode: 401
      });
    }

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
