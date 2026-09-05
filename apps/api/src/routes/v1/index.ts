import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { validateBody } from "../../lib/validate.js";
import { registerAgentExecutionRoutes } from "../../modules/agent-executions/agentExecutionRoutes.js";
import { registerEvalRunRoutes } from "../../modules/eval-runs/evalRunRoutes.js";
import { registerGovernanceRoutes } from "../../modules/governance/governanceRoutes.js";
import { registerObservabilityRoutes } from "../../modules/observability/observabilityRoutes.js";
import { registerTaskContractRoutes } from "../../modules/task-contracts/taskContractRoutes.js";
import { registerAuditRoutes } from "../../modules/audit/auditRoutes.js";
import { env } from "../../lib/env.js";
import {
  enforceTenantScope,
  getAuthContextFromRequest,
  registerAuthContext
} from "../../modules/auth/authPlugin.js";
import { getMachineAuthContextFromRequest } from "../../modules/auth/machineAuthPlugin.js";
import { registerAuthRoutes } from "../../modules/auth/authRoutes.js";
import { registerApiKeyRoutes } from "../../modules/api-keys/apiKey.routes.js";

const validationTestSchema = z.object({
  name: z.string().min(1)
});

export async function registerV1Routes(app: FastifyInstance) {
  registerAuthContext(app);

  app.post("/_test/validation", async (request) => {
    const body = validateBody(validationTestSchema, request.body);
    return {
      ok: true,
      name: body.name
    };
  });

  await registerAuthRoutes(app);

  await app.register(async (protectedApp) => {
    protectedApp.addHook("preHandler", async (request) => {
      const authHeader = request.headers.authorization;
      if (authHeader && authHeader.startsWith("Bearer ")) {
        request.authContext = await getMachineAuthContextFromRequest(request);
      } else {
        request.authContext = getAuthContextFromRequest(request, env.AUTH_SESSION_SECRET);
      }
      enforceTenantScope(request);
    });

    await registerTaskContractRoutes(protectedApp);
    await registerAgentExecutionRoutes(protectedApp);
    await registerEvalRunRoutes(protectedApp);
    await registerGovernanceRoutes(protectedApp);
    await registerObservabilityRoutes(protectedApp);
    await registerAuditRoutes(protectedApp);
    await registerApiKeyRoutes(protectedApp);
  });
}
