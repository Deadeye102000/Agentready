import type { FastifyReply, FastifyRequest } from "fastify";
import { HttpError } from "../../lib/httpError.js";

export type SystemRole = "OWNER" | "ADMIN" | "MEMBER" | "VIEWER" | "APPROVER";

export const requireRole = (allowedRoles: SystemRole[]) => {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    if (!request.authContext) {
      throw new HttpError({
        code: "UNAUTHORIZED",
        message: "Authentication context missing.",
        statusCode: 401
      });
    }

    if (request.authContext.actorType !== "USER") {
      throw new HttpError({
        code: "FORBIDDEN",
        message: "You do not have permission to perform this action.",
        statusCode: 403
      });
    }

    const userRole = request.authContext.role;

    if (!allowedRoles.includes(userRole)) {
      request.log.warn({ userRole, allowedRoles }, "RBAC Check Failed: Insufficient permissions");
      throw new HttpError({
        code: "FORBIDDEN",
        message: "You do not have permission to perform this action.",
        statusCode: 403
      });
    }
  };
};
