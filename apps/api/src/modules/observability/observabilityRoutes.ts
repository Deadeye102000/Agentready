import type { FastifyInstance } from "fastify";
import { ObservabilityRepository } from "./observabilityRepository.js";
import { dashboardQuerySchema } from "./observabilitySchemas.js";
import { ObservabilityService } from "./observabilityService.js";

export async function registerObservabilityRoutes(app: FastifyInstance) {
  const service = new ObservabilityService(new ObservabilityRepository(app.prisma));

  app.get("/observability/dashboard", async (request) => {
    return service.getDashboard(dashboardQuerySchema.parse(request.query));
  });
}
