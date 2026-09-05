import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { validateBody } from "../../lib/validate.js";
import { AuditRepository } from "../audit/auditRepository.js";
import { AuditService } from "../audit/auditService.js";
import { requireRole } from "../auth/rbac.js";
import { ApiKeyService } from "./apiKey.service.js";

const apiKeyBodySchema = z.object({
  name: z.string().min(1),
  scopes: z.array(z.string()).optional()
});

export async function registerApiKeyRoutes(app: FastifyInstance) {
  const service = new ApiKeyService(
    app.prisma,
    new AuditService(new AuditRepository(app.prisma))
  );

  // Apply OWNER and ADMIN RBAC protection to each endpoint individually to avoid Fastify hook leakage
  app.post("/api-keys", {
    preHandler: [requireRole(["OWNER", "ADMIN"])]
  }, async (request) => {
    const context = request.authContext!;
    const body = validateBody(apiKeyBodySchema, request.body);
    return service.createApiKey(context.organizationId, body.name, body.scopes, context.userId);
  });

  app.get("/api-keys", {
    preHandler: [requireRole(["OWNER", "ADMIN"])]
  }, async (request) => {
    const context = request.authContext!;
    return service.listApiKeys(context.organizationId);
  });

  app.delete("/api-keys/:id", {
    preHandler: [requireRole(["OWNER", "ADMIN"])]
  }, async (request) => {
    const context = request.authContext!;
    const { id } = z.object({ id: z.string().min(1) }).parse(request.params);
    return service.revokeApiKey(context.organizationId, id, context.userId);
  });
}
