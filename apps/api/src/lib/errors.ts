import type { FastifyInstance } from "fastify";
import { ZodError } from "zod";
import { HttpError } from "./httpError.js";

export function registerErrorHandlers(app: FastifyInstance) {
  app.setNotFoundHandler((request, reply) => {
    return reply.code(404).send({
      error: {
        code: "NOT_FOUND",
        message: `Route ${request.method} ${request.url} was not found`,
        details: {
          requestId: request.id
        }
      }
    });
  });

  app.setErrorHandler((error, request, reply) => {
    if (error instanceof ZodError) {
      return reply.code(400).send({
        error: {
          code: "VALIDATION_ERROR",
          message: "Request validation failed",
          details: {
            requestId: request.id,
            issues: error.issues
          }
        }
      });
    }

    if (error instanceof HttpError) {
      return reply.code(error.statusCode).send({
        error: {
          code: error.code,
          message: error.message,
          details: {
            requestId: request.id,
            ...error.details
          }
        }
      });
    }

    request.log.error(error);
    return reply.code(500).send({
      error: {
        code: "INTERNAL_ERROR",
        message: "Internal server error",
        details: {
          requestId: request.id
        }
      }
    });
  });
}
