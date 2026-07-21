import cors from "@fastify/cors";
import Fastify from "fastify";
import { randomUUID } from "node:crypto";
import { prisma } from "./lib/prisma.js";
import { registerErrorHandlers } from "./lib/errors.js";
import { env } from "./lib/env.js";
import { registerHealthRoutes } from "./routes/health.js";
import { registerV1Routes } from "./routes/v1/index.js";

export async function buildServer() {
  const app = Fastify({
    genReqId: (request) => {
      const requestId = request.headers["x-request-id"];
      return Array.isArray(requestId) ? requestId[0] : requestId ?? randomUUID();
    },
    logger: {
      level: env.LOG_LEVEL
    }
  });

  app.decorate("prisma", prisma);

  await app.register(cors, {
    origin: env.API_CORS_ORIGINS,
    credentials: true
  });

  registerErrorHandlers(app);

  await registerHealthRoutes(app);
  await app.register(registerV1Routes, { prefix: "/api/v1" });

  return app;
}
