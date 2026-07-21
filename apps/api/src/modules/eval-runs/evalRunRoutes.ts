import type { FastifyInstance } from "fastify";
import { validateBody } from "../../lib/validate.js";
import { AuditRepository } from "../audit/auditRepository.js";
import { EvalRunRepository } from "./evalRunRepository.js";
import { EvalRunService } from "./evalRunService.js";
import { createEvalRunBodySchema, evalRunListQuerySchema } from "./evalRunSchemas.js";

export async function registerEvalRunRoutes(app: FastifyInstance) {
  const service = new EvalRunService(new EvalRunRepository(app.prisma), new AuditRepository(app.prisma));

  app.get("/eval-runs", async (request) => {
    return service.list(evalRunListQuerySchema.parse(request.query));
  });

  app.post("/eval-runs", async (request, reply) => {
    const evalRun = await service.create(validateBody(createEvalRunBodySchema, request.body));
    return reply.code(201).send(evalRun);
  });
}
