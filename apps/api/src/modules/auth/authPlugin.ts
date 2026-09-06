import { verifySession } from "@agentready/auth";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { HttpError } from "../../lib/httpError.js";
import type { AuthContext } from "./authService.js";

import type { SystemRole } from "./rbac.js";

const VALID_SYSTEM_ROLES = new Set<SystemRole>(["OWNER", "ADMIN", "MEMBER", "VIEWER", "APPROVER"]);

export function parseSystemRole(role: unknown): SystemRole {
  if (typeof role === "string" && VALID_SYSTEM_ROLES.has(role as SystemRole)) {
    return role as SystemRole;
  }
  throw new HttpError({
    code: "INTERNAL_ERROR",
    message: `Invalid membership role stored in database: "${String(role)}". Expected one of: ${Array.from(VALID_SYSTEM_ROLES).join(", ")}`,
    statusCode: 500
  });
}

export function parseCookies(cookieHeader: string | undefined) {
  const cookies = new Map<string, string>();
  if (!cookieHeader) {
    return cookies;
  }

  for (const part of cookieHeader.split(";")) {
    const [rawName, ...rawValue] = part.trim().split("=");
    if (!rawName || rawValue.length === 0) {
      continue;
    }

    cookies.set(rawName, rawValue.join("="));
  }

  return cookies;
}

export async function getAuthContextFromRequest(
  request: FastifyRequest,
  sessionSecret: string
): Promise<AuthContext | null> {
  const token = parseCookies(request.headers.cookie).get("agentready_session");
  if (!token) {
    return null;
  }

  const session = verifySession(token, sessionSecret);
  if (!session) {
    return null;
  }

  const prisma = request.server.prisma;
  if (!prisma) {
    return null;
  }

  const member = await prisma.organizationMember.findFirst({
    where: {
      userId: session.userId,
      organizationId: session.organizationId
    }
  });

  if (!member) {
    return null;
  }

  const role = parseSystemRole(member.role);

  return {
    organizationId: session.organizationId,
    actorType: "USER",
    userId: session.userId,
    role
  };
}

export function registerAuthContext(app: FastifyInstance) {
  app.decorateRequest("authContext", null);
}

export function requireAuth(request: FastifyRequest) {
  if (!request.authContext) {
    throw new HttpError({
      code: "UNAUTHORIZED",
      message: "Authentication required",
      statusCode: 401
    });
  }

  return request.authContext;
}

export function requireOrgContext(request: FastifyRequest) {
  return requireAuth(request);
}

export function enforceTenantScope(request: FastifyRequest) {
  const context = requireAuth(request);
  const queryOrganizationId = readOrganizationId(request.query);
  const bodyOrganizationId = readOrganizationId(request.body);
  const organizationId = queryOrganizationId ?? bodyOrganizationId;

  if (organizationId && organizationId !== context.organizationId) {
    throw new HttpError({
      code: "FORBIDDEN",
      message: "Authenticated user cannot access this organization",
      statusCode: 403
    });
  }
}

function readOrganizationId(value: unknown) {
  if (typeof value !== "object" || value === null || !("organizationId" in value)) {
    return undefined;
  }

  const organizationId = (value as { organizationId?: unknown }).organizationId;
  return typeof organizationId === "string" ? organizationId : undefined;
}
