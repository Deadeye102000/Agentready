import type { FastifyInstance } from "fastify";
import { ExecutionRunnerService } from "./executionRunner.service.js";
import { AuditService } from "../audit/auditService.js";
import { AuditRepository } from "../audit/auditRepository.js";

declare module "fastify" {
  interface FastifyInstance {
    executionRunner?: ExecutionRunnerService;
  }
}

export async function workerPlugin(app: FastifyInstance) {
  const auditService = new AuditService(new AuditRepository(app.prisma));
  const runner = new ExecutionRunnerService(app.prisma, auditService);

  // Expose on the app instance
  app.executionRunner = runner;

  // Hook into Fastify server lifecycle hooks
  app.addHook("onReady", async () => {
    if (
      process.env.NODE_ENV === "test" ||
      process.env.NODE_TEST_CONTEXT !== undefined ||
      process.execArgv.includes("--test")
    ) {
      return;
    }
    app.log.info("[Worker Plugin] Starting background execution runner...");
    runner.start();
  });

  // onClose runs when the Fastify server is closing
  app.addHook("onClose", async (instance) => {
    instance.log.info("[Worker Plugin] Stopping background execution runner...");
    runner.stop();
  });
}
