import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { validateBody } from "../../lib/validate.js";
import { registerAgentExecutionRoutes } from "../../modules/agent-executions/agentExecutionRoutes.js";
import { registerEvalRunRoutes } from "../../modules/eval-runs/evalRunRoutes.js";
import { registerGovernanceRoutes } from "../../modules/governance/governanceRoutes.js";
import { registerObservabilityRoutes } from "../../modules/observability/observabilityRoutes.js";
import { registerTaskContractRoutes } from "../../modules/task-contracts/taskContractRoutes.js";
import { env } from "../../lib/env.js";
import {
  enforceTenantScope,
  getAuthContextFromRequest,
  registerAuthContext
} from "../../modules/auth/authPlugin.js";
import { registerAuthRoutes } from "../../modules/auth/authRoutes.js";

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

  app.addHook("preHandler", async (request) => {
    request.authContext = getAuthContextFromRequest(request, env.AUTH_SESSION_SECRET);
    enforceTenantScope(request);
  });

  await registerTaskContractRoutes(app);
  await registerAgentExecutionRoutes(app);
  await registerEvalRunRoutes(app);
  await registerGovernanceRoutes(app);
  await registerObservabilityRoutes(app);
}
