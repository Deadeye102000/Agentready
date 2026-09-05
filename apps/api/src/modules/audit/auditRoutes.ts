import type { FastifyInstance } from "fastify";
import { requireOrgContext } from "../auth/authPlugin.js";
import { requireScope } from "../auth/scopes.js";
import { AuditRepository } from "./auditRepository.js";
import { auditLogListQuerySchema } from "./auditSchemas.js";
import { AuditService } from "./auditService.js";

export async function registerAuditRoutes(app: FastifyInstance) {
  const service = new AuditService(new AuditRepository(app.prisma));

  app.get("/audit-logs", {
    preHandler: [requireScope("audit:read")]
  }, async (request) => {
    const context = requireOrgContext(request);
    const query = auditLogListQuerySchema.parse(request.query);

    return service.listRecent({
      organizationId: context.organizationId,
      limit: query.limit
    });
  });
}
