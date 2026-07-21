import type { FastifyInstance } from "fastify";
import { requireOrgContext } from "../auth/authPlugin.js";
import { ObservabilityRepository } from "./observabilityRepository.js";
import { dashboardQuerySchema } from "./observabilitySchemas.js";
import { ObservabilityService } from "./observabilityService.js";

export async function registerObservabilityRoutes(app: FastifyInstance) {
  const service = new ObservabilityService(new ObservabilityRepository(app.prisma));

  app.get("/observability/dashboard", async (request) => {
    const context = requireOrgContext(request);
    dashboardQuerySchema.parse(request.query);
    return service.getDashboard({ organizationId: context.organizationId });
  });
}
