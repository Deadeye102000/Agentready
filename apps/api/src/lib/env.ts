import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  API_HOST: z.string().min(1).default("0.0.0.0"),
  API_PORT: z.coerce.number().int().positive().default(3001),
  API_CORS_ORIGINS: z
    .string()
    .default("http://localhost:3000")
    .transform((value) => value.split(",").map((origin) => origin.trim()).filter(Boolean)),
  DATABASE_URL: z
    .string()
    .url()
    .default("postgresql://agentready:agentready@localhost:5432/agentready?schema=public"),
  AUTH_SESSION_SECRET: z.string().min(32).default("development-auth-session-secret-change-me"),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info")
});

export const env = envSchema.parse(process.env);
