import type { FastifyInstance } from "fastify";
import { validateBody } from "../../lib/validate.js";
import { AuditRepository } from "../audit/auditRepository.js";
import { AuditService } from "../audit/auditService.js";
import { TenancyRepository } from "../tenancy/tenancyRepository.js";
import { TenancyService } from "../tenancy/tenancyService.js";
import { requireOrgContext } from "../auth/authPlugin.js";
import { GovernanceRepository } from "../governance/governanceRepository.js";
import { EvalRunRepository } from "./evalRunRepository.js";
import { EvalRunService } from "./evalRunService.js";
import { createEvalRunBodySchema, evalRunListQuerySchema } from "./evalRunSchemas.js";

export async function registerEvalRunRoutes(app: FastifyInstance) {
  const service = new EvalRunService(
    new EvalRunRepository(app.prisma),
    new AuditService(new AuditRepository(app.prisma)),
    new TenancyService(new TenancyRepository(app.prisma)),
    new GovernanceRepository(app.prisma)
  );

  app.get("/eval-runs", async (request) => {
    const context = requireOrgContext(request);
    const query = evalRunListQuerySchema.parse(request.query);
    return service.list({ ...query, organizationId: context.organizationId });
  });

  app.post("/eval-runs", async (request, reply) => {
    const context = requireOrgContext(request);
    const body = validateBody(createEvalRunBodySchema, request.body);
    const evalRun = await service.create({ ...body, organizationId: context.organizationId });
    return reply.code(201).send(evalRun);
  });
}
