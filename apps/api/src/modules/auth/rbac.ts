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

    let userRole = request.authContext.role as SystemRole | undefined;

    if (!userRole) {
      const member = await request.server.prisma.organizationMember.findFirst({
        where: {
          userId: request.authContext.userId,
          organizationId: request.authContext.organizationId
        }
      });

      userRole = member?.role as SystemRole | undefined;
      if (userRole) {
        request.authContext.role = userRole;
      }
    }

    if (!userRole) {
      throw new HttpError({
        code: "FORBIDDEN",
        message: "User is not a member of this organization.",
        statusCode: 403
      });
    }

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
