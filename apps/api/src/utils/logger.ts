import { env } from "../lib/env.js";

export const loggerConfig = {
  level: env.LOG_LEVEL,
  redact: {
    paths: [
      "req.headers.authorization",
      "req.headers.cookie",
      'req.headers["set-cookie"]',
      "req.body.password",
      "req.body.token",
      "req.body.secret",
      "req.body.authorization",
      "req.body.cookie"
    ],
    censor: "[REDACTED]"
  },
  serializers: {
    req(request: any) {
      return {
        method: request.method,
        url: request.url,
        headers: request.headers,
        requestId: request.id,
        // Enrich context with tenant organization and human/machine actor user IDs
        userId: request.authContext?.userId,
        organizationId: request.authContext?.organizationId
      };
    }
  }
};
