import { verifySession } from "@agentready/auth";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { HttpError } from "../../lib/httpError.js";
import type { AuthContext } from "./authService.js";

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

export function getAuthContextFromRequest(request: FastifyRequest, sessionSecret: string): AuthContext | null {
  const token = parseCookies(request.headers.cookie).get("agentready_session");
  if (!token) {
    return null;
  }

  const session = verifySession(token, sessionSecret);
  if (!session) {
    return null;
  }

  return {
    organizationId: session.organizationId,
    actorType: "USER",
    userId: session.userId
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
