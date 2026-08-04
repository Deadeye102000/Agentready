import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import * as Sentry from "@sentry/node";
import { ZodError } from "zod";
import type { ErrorCode } from "./errorCodes.js";
import { HttpError } from "./httpError.js";

type ErrorResponse = {
  error: {
    code: ErrorCode;
    message: string;
    details: Record<string, unknown>;
  };
};

type PrismaKnownErrorLike = {
  code: string;
  clientVersion?: string;
  meta?: Record<string, unknown>;
};

export function registerErrorHandlers(app: FastifyInstance) {
  app.setNotFoundHandler((request, reply) => {
    return sendError(reply, 404, {
      code: "NOT_FOUND",
      message: `Route ${request.method} ${request.url} was not found`,
      details: { requestId: request.id }
    });
  });

  app.setErrorHandler((error, request, reply) => {
    const mapped = mapError(error, request);

    if (mapped.statusCode >= 500) {
      request.log.error({ err: error, requestId: request.id }, "Unhandled API error");
      
      Sentry.captureException(error, {
        tags: {
          requestId: request.id,
          organizationId: request.authContext?.organizationId,
          userId: request.authContext?.userId
        }
      });
    } else {
      request.log.warn({ err: error, requestId: request.id }, "Handled API error");
    }

    return sendError(reply, mapped.statusCode, mapped);
  });
}

function mapError(error: unknown, request: FastifyRequest) {
  if (error instanceof ZodError) {
    return {
      statusCode: 400,
      code: "VALIDATION_ERROR" as const,
      message: "Request validation failed",
      details: {
        requestId: request.id,
        issues: error.issues.map((issue) => ({
          path: issue.path.join("."),
          message: issue.message,
          code: issue.code
        }))
      }
    };
  }

  if (error instanceof HttpError) {
    return {
      statusCode: error.statusCode,
      code: error.code,
      message: error.message,
      details: {
        requestId: request.id,
        ...error.details
      }
    };
  }

  const prismaError = getPrismaKnownError(error);
  if (prismaError) {
    return mapPrismaError(prismaError, request);
  }

  if (isFastifyBodyLimitError(error)) {
    return {
      statusCode: 413,
      code: "PAYLOAD_TOO_LARGE" as const,
      message: "Request body is too large",
      details: { requestId: request.id }
    };
  }

  if (isRateLimitError(error)) {
    return {
      statusCode: 429,
      code: "RATE_LIMITED" as const,
      message: "Too many requests",
      details: { requestId: request.id }
    };
  }

  if (error instanceof Error && error.message === "Origin is not allowed by CORS") {
    return {
      statusCode: 403,
      code: "FORBIDDEN" as const,
      message: "Origin is not allowed by CORS",
      details: { requestId: request.id }
    };
  }

  return {
    statusCode: 500,
    code: "INTERNAL_ERROR" as const,
    message: "Internal server error",
    details: { requestId: request.id }
  };
}

function mapPrismaError(error: PrismaKnownErrorLike, request: FastifyRequest) {
  if (error.code === "P2002") {
    return {
      statusCode: 409,
      code: "CONFLICT" as const,
      message: "Resource already exists",
      details: {
        requestId: request.id,
        target: error.meta?.target
      }
    };
  }

  if (error.code === "P2025") {
    return {
      statusCode: 404,
      code: "NOT_FOUND" as const,
      message: "Resource was not found",
      details: { requestId: request.id }
    };
  }

  if (error.code === "P2003") {
    return {
      statusCode: 400,
      code: "VALIDATION_ERROR" as const,
      message: "Related resource does not exist",
      details: {
        requestId: request.id,
        field: error.meta?.field_name
      }
    };
  }

  return {
    statusCode: 500,
    code: "INTERNAL_ERROR" as const,
    message: "Database operation failed",
    details: { requestId: request.id }
  };
}

function sendError(
  reply: FastifyReply,
  statusCode: number,
  input: { code: ErrorCode; message: string; details: Record<string, unknown> }
) {
  const body: ErrorResponse = {
    error: {
      code: input.code,
      message: input.message,
      details: input.details
    }
  };

  return reply.code(statusCode).send(body);
}

function getPrismaKnownError(error: unknown): PrismaKnownErrorLike | null {
  if (typeof error !== "object" || error === null || !("code" in error)) {
    return null;
  }

  const code = (error as { code?: unknown }).code;
  if (typeof code !== "string" || !code.startsWith("P")) {
    return null;
  }

  return error as PrismaKnownErrorLike;
}

function isFastifyBodyLimitError(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "FST_ERR_CTP_BODY_TOO_LARGE"
  );
}

function isRateLimitError(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "statusCode" in error &&
    (error as { statusCode?: unknown }).statusCode === 429
  );
}
