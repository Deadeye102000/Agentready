import type { FastifyInstance } from "fastify";
import { AuditRepository } from "../audit/auditRepository.js";
import { AuditService } from "../audit/auditService.js";
import { requireOrgContext } from "../auth/authPlugin.js";
import { requireRole } from "../auth/rbac.js";
import { TenancyRepository } from "../tenancy/tenancyRepository.js";
import { TenancyService } from "../tenancy/tenancyService.js";
import { TaskContractRepository } from "./taskContractRepository.js";
import { TaskContractService } from "./taskContractService.js";
import { HttpError } from "../../lib/httpError.js";
import { validateBody } from "../../lib/validate.js";
import {
  createTaskContractBodySchema,
  taskContractListQuerySchema,
  taskContractParamsSchema
} from "./taskContractSchemas.js";

export async function registerTaskContractRoutes(app: FastifyInstance) {
  const service = new TaskContractService(
    new TaskContractRepository(app.prisma),
    new AuditService(new AuditRepository(app.prisma)),
    new TenancyService(new TenancyRepository(app.prisma))
  );

  app.get("/task-contracts", async (request) => {
    const context = requireOrgContext(request);
    const query = taskContractListQuerySchema.parse(request.query);
    return service.list({ ...query, organizationId: context.organizationId });
  });

  app.post("/task-contracts", {
    preHandler: [requireRole(["OWNER", "ADMIN"])]
  }, async (request, reply) => {
    const context = requireOrgContext(request);
    const body = validateBody(createTaskContractBodySchema, request.body);
    const contract = await service.create({
      ...body,
      organizationId: context.organizationId,
      actorUserId: context.userId
    });
    return reply.code(201).send(contract);
  });

  app.get("/task-contracts/:id", async (request) => {
    const context = requireOrgContext(request);
    const params = taskContractParamsSchema.parse(request.params);
    const contract = await service.get({ id: params.id, organizationId: context.organizationId });

    if (!contract) {
      throw new HttpError({
        code: "NOT_FOUND",
        message: "Task contract was not found",
        statusCode: 404
      });
    }

    return contract;
  });
}
