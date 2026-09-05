import { z } from "zod";

export const DEV_DEFAULT_AUTH_SESSION_SECRET = "development-auth-session-secret-change-me";

export const envSchema = z
  .object({
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
    DIRECT_URL: z.string().optional(),
    AUTH_SESSION_SECRET: z.string().min(32).optional(),
    SENTRY_DSN: z.string().url().optional(),
    LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info")
  })
  .superRefine((data, ctx) => {
    if (data.NODE_ENV === "production") {
      if (!data.AUTH_SESSION_SECRET || data.AUTH_SESSION_SECRET === DEV_DEFAULT_AUTH_SESSION_SECRET) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["AUTH_SESSION_SECRET"],
          message: "AUTH_SESSION_SECRET is required in production and must not use the development default"
        });
      }
    }
  })
  .transform((data) => ({
    ...data,
    AUTH_SESSION_SECRET: data.AUTH_SESSION_SECRET ?? DEV_DEFAULT_AUTH_SESSION_SECRET
  }));

export type Env = z.infer<typeof envSchema>;

export function parseEnv(rawEnv: Record<string, string | undefined> = process.env): Env {
  return envSchema.parse(rawEnv);
}

export const env = parseEnv(process.env);
