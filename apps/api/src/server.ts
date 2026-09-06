import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import * as Sentry from "@sentry/node";
import Fastify from "fastify";
import { randomUUID } from "node:crypto";
import { prisma } from "./lib/prisma.js";
import { registerErrorHandlers } from "./lib/errors.js";
import { env } from "./lib/env.js";
import { registerHealthRoutes } from "./routes/health.js";
import { registerV1Routes } from "./routes/v1/index.js";
import { workerPlugin } from "./modules/workers/workerPlugin.js";
import { loggerConfig } from "./utils/logger.js";

export async function buildServer(options?: { prisma?: any }) {
  if (env.SENTRY_DSN) {
    Sentry.init({
      dsn: env.SENTRY_DSN,
      environment: env.NODE_ENV,
      tracesSampleRate: env.NODE_ENV === "production" ? 0.1 : 1.0
    });
  }

  const app = Fastify({
    bodyLimit: env.API_BODY_LIMIT_BYTES,
    genReqId: (request) => {
      const requestId = request.headers["x-request-id"];
      return Array.isArray(requestId) ? requestId[0] : requestId ?? randomUUID();
    },
    logger: loggerConfig
  });

  app.decorate("prisma", options?.prisma ?? prisma);

  await app.register(workerPlugin);

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

  app.addHook("onReady", async () => {
    if (
      process.env.NODE_ENV === "test" ||
      process.env.NODE_TEST_CONTEXT !== undefined ||
      process.execArgv.includes("--test")
    ) {
      return;
    }
    try {
      await app.prisma.$connect();
      app.log.info("Database connection established successfully.");
    } catch (err: any) {
      app.log.error({ err }, "Database connection failed on startup.");
      throw err;
    }
  });

  await registerHealthRoutes(app);
  await app.register(registerV1Routes, { prefix: "/api/v1" });

  return app;
}
