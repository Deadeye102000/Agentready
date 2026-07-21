import type { FastifyInstance } from "fastify";
import { AuditRepository } from "../audit/auditRepository.js";
import { TaskContractRepository } from "./taskContractRepository.js";
import { TaskContractService } from "./taskContractService.js";
import { HttpError } from "../../lib/httpError.js";
import { validateBody } from "../../lib/validate.js";
import {
  createTaskContractBodySchema,
  taskContractListQuerySchema,
  taskContractParamsSchema,
  taskContractTenantQuerySchema
} from "./taskContractSchemas.js";

export async function registerTaskContractRoutes(app: FastifyInstance) {
  const service = new TaskContractService(
    new TaskContractRepository(app.prisma),
    new AuditRepository(app.prisma)
  );

  app.get("/task-contracts", async (request) => {
    return service.list(taskContractListQuerySchema.parse(request.query));
  });

  app.post("/task-contracts", async (request, reply) => {
    const contract = await service.create(validateBody(createTaskContractBodySchema, request.body));
    return reply.code(201).send(contract);
  });

  app.get("/task-contracts/:id", async (request) => {
    const params = taskContractParamsSchema.parse(request.params);
    const query = taskContractTenantQuerySchema.parse(request.query);
    const contract = await service.get({ id: params.id, organizationId: query.organizationId });

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
