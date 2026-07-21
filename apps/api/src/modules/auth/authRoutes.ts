import type { FastifyInstance } from "fastify";
import { env } from "../../lib/env.js";
import { validateBody } from "../../lib/validate.js";
import { AuditRepository } from "../audit/auditRepository.js";
import { AuditService } from "../audit/auditService.js";
import { AuthRepository } from "./authRepository.js";
import { getAuthContextFromRequest, requireAuth } from "./authPlugin.js";
import { loginBodySchema, registerBodySchema } from "./authSchemas.js";
import { AuthService } from "./authService.js";

export async function registerAuthRoutes(app: FastifyInstance) {
  const service = new AuthService(
    new AuthRepository(app.prisma),
    env.AUTH_SESSION_SECRET,
    env.NODE_ENV === "production",
    new AuditService(new AuditRepository(app.prisma))
  );

  app.post(
    "/auth/register",
    {
      config: {
        rateLimit: {
          max: env.API_AUTH_RATE_LIMIT_MAX,
          timeWindow: env.API_AUTH_RATE_LIMIT_WINDOW
        }
      }
    },
    async (request, reply) => {
      const session = await service.register(validateBody(registerBodySchema, request.body));
      return reply.header("Set-Cookie", session.cookie).code(201).send(session.body);
    }
  );

  app.post(
    "/auth/login",
    {
      config: {
        rateLimit: {
          max: env.API_AUTH_RATE_LIMIT_MAX,
          timeWindow: env.API_AUTH_RATE_LIMIT_WINDOW
        }
      }
    },
    async (request, reply) => {
      const session = await service.login(validateBody(loginBodySchema, request.body));
      return reply.header("Set-Cookie", session.cookie).send(session.body);
    }
  );

  app.post("/auth/logout", async (request, reply) => {
    const context = getAuthContextFromRequest(request, env.AUTH_SESSION_SECRET);
    const cookie = await service.logout(context);
    return reply.header("Set-Cookie", cookie).send({ ok: true });
  });

  app.get("/auth/me", async (request) => {
    request.authContext = getAuthContextFromRequest(request, env.AUTH_SESSION_SECRET);
    return service.currentUser(requireAuth(request));
  });
}
