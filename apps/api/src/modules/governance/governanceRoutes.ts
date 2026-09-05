import type { FastifyInstance } from "fastify";
import { AuditRepository } from "../audit/auditRepository.js";
import { AuditService } from "../audit/auditService.js";
import { requireOrgContext } from "../auth/authPlugin.js";
import { requireScope } from "../auth/scopes.js";
import { TenancyRepository } from "../tenancy/tenancyRepository.js";
import { TenancyService } from "../tenancy/tenancyService.js";
import { GovernanceRepository } from "./governanceRepository.js";
import { GovernanceService } from "./governanceService.js";
import { AgentExecutionRepository } from "../agent-executions/agentExecutionRepository.js";
import { emptyQuerySchema } from "./governanceSchemas.js";
import { registerFeatureFlagRoutes } from "./featureFlag.routes.js";
import { registerApprovalRoutes } from "./approval.routes.js";

export async function registerGovernanceRoutes(app: FastifyInstance) {
  const service = new GovernanceService(
    new GovernanceRepository(app.prisma),
    new AuditService(new AuditRepository(app.prisma)),
    new TenancyService(new TenancyRepository(app.prisma)),
    new AgentExecutionRepository(app.prisma)
  );

  // Register refactored sub-routes
  await registerFeatureFlagRoutes(app, service);
  await registerApprovalRoutes(app, service);

  // Keep MCP servers routes in the main governanceRoutes file
  app.get("/mcp-servers", {
    preHandler: [requireScope("governance:read")]
  }, async (request) => {
    const context = requireOrgContext(request);
    emptyQuerySchema.parse(request.query);
    return service.listMcpServers({ organizationId: context.organizationId });
  });
}
