import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  API_HOST: z.string().min(1).default("0.0.0.0"),
  API_PORT: z.coerce.number().int().positive().default(3001),
  API_BODY_LIMIT_BYTES: z.coerce.number().int().positive().max(10 * 1024 * 1024).default(1024 * 1024),
  API_CORS_ORIGINS: z
    .string()
    .default("http://localhost:3000")
    .transform((value) => value.split(",").map((origin) => origin.trim()).filter(Boolean))
    .refine((origins) => origins.length > 0, "At least one CORS origin is required")
    .refine(
      (origins) => !origins.includes("*"),
      "Wildcard CORS origins are not allowed because credentials are enabled"
    ),
  API_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(300),
  API_RATE_LIMIT_WINDOW: z.string().min(1).default("1 minute"),
  API_AUTH_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(20),
  API_AUTH_RATE_LIMIT_WINDOW: z.string().min(1).default("1 minute"),
  DATABASE_URL: z
    .string()
    .url()
    .default("postgresql://agentready:agentready@localhost:5432/agentready?schema=public"),
  AUTH_SESSION_SECRET: z.string().min(32).default("development-auth-session-secret-change-me"),
  SENTRY_DSN: z.string().url().optional(),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info")
});

export const env = envSchema.parse(process.env);
