import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import Fastify from "fastify";
import { randomUUID } from "node:crypto";
import { prisma } from "./lib/prisma.js";
import { registerErrorHandlers } from "./lib/errors.js";
import { env } from "./lib/env.js";
import { registerHealthRoutes } from "./routes/health.js";
import { registerV1Routes } from "./routes/v1/index.js";

export async function buildServer() {
  const app = Fastify({
    bodyLimit: env.API_BODY_LIMIT_BYTES,
    genReqId: (request) => {
      const requestId = request.headers["x-request-id"];
      return Array.isArray(requestId) ? requestId[0] : requestId ?? randomUUID();
    },
    logger: {
      level: env.LOG_LEVEL
    }
  });

  app.decorate("prisma", prisma);

  await app.register(helmet, {
    contentSecurityPolicy: env.NODE_ENV === "production" ? undefined : false
  });

  await app.register(rateLimit, {
    max: env.API_RATE_LIMIT_MAX,
    timeWindow: env.API_RATE_LIMIT_WINDOW
  });

  await app.register(cors, {
    origin: (origin, callback) => {
      if (!origin || env.API_CORS_ORIGINS.includes(origin)) {
        callback(null, true);
        return;
      }

      callback(new Error("Origin is not allowed by CORS"), false);
    },
    credentials: true
  });

  registerErrorHandlers(app);

  await registerHealthRoutes(app);
  await app.register(registerV1Routes, { prefix: "/api/v1" });

  return app;
}
