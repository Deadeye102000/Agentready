import type { FastifyRequest } from "fastify";
import { HttpError } from "../../lib/httpError.js";
import type { SystemRole } from "./rbac.js";

export const API_KEY_SCOPES = [
  "*",
  "admin",
  "all",
  "executions:read",
  "executions:write",
  "eval:read",
  "eval:write",
  "contracts:read",
  "governance:read",
  "traces:read",
  "traces:write",
  "tool_calls:check",
  "tool_calls:result",
  "observability:read",
  "audit:read",
] as const;

export type ApiKeyScope = (typeof API_KEY_SCOPES)[number];

export const ROLE_SCOPES: Record<SystemRole, readonly string[]> = {
  OWNER: ["*"],
  ADMIN: ["*"],
  MEMBER: [
    "contracts:read",
    "executions:read",
    "executions:write",
    "eval:read",
    "eval:write",
    "governance:read",
    "traces:read",
    "traces:write",
    "tool_calls:check",
    "observability:read",
    "audit:read"
  ],
  APPROVER: [
    "contracts:read",
    "executions:read",
    "eval:read",
    "governance:read",
    "traces:read",
    "observability:read",
    "audit:read"
  ],
  VIEWER: [
    "contracts:read",
    "executions:read",
    "eval:read",
    "governance:read",
    "traces:read",
    "observability:read",
    "audit:read"
  ]
};

/**
 * Checks whether the given list of scopes satisfies a required scope.
 * Supports:
 * - "admin", "all", "*" wildcard full access
 * - Exact scope match (e.g. "executions:read")
 * - Resource wildcard match (e.g. "executions:*" matches "executions:read" and "executions:write")
 */
export function hasScope(
  grantedScopes: readonly string[] | string[] | undefined,
  requiredScope: string
): boolean {
  if (!grantedScopes || !Array.isArray(grantedScopes)) {
    return false;
  }

  // Full admin / superuser aliases
  if (
    grantedScopes.includes("admin") ||
    grantedScopes.includes("all") ||
    grantedScopes.includes("*")
  ) {
    return true;
  }

  // Exact match
  if (grantedScopes.includes(requiredScope)) {
    return true;
  }

  // Resource prefix match (e.g. "executions:*" matches "executions:read")
  const colonIndex = requiredScope.indexOf(":");
  if (colonIndex !== -1) {
    const resource = requiredScope.slice(0, colonIndex);
    if (grantedScopes.includes(`${resource}:*`) || grantedScopes.includes(resource)) {
      return true;
    }
  }

  return false;
}

/**
 * Fastify preHandler hook enforcing that:
 * - Session-authenticated human users (actorType === "USER") possess role-based scopes
 *   mapped via ROLE_SCOPES from their resolved membership role.
 * - Bearer-authenticated API key requests (actorType === "AGENT") possess at least one
 *   of the required scopes.
 */
export const requireScope = (requiredScope: ApiKeyScope | ApiKeyScope[]) => {
  const scopesList = Array.isArray(requiredScope) ? requiredScope : [requiredScope];

  return async (request: FastifyRequest) => {
    const context = request.authContext;
    if (!context) {
      throw new HttpError({
        code: "UNAUTHORIZED",
        message: "Authentication context missing.",
        statusCode: 401
      });
    }

    if (context.actorType === "USER") {
      const userRole = context.role;
      if (!userRole || !(userRole in ROLE_SCOPES)) {
        throw new HttpError({
          code: "FORBIDDEN",
          message: "User is not a member of this organization.",
          statusCode: 403
        });
      }

      const roleScopes = ROLE_SCOPES[userRole];
      const isAuthorized = scopesList.some((s) => hasScope(roleScopes, s));
      if (!isAuthorized) {
        request.log.warn(
          { requiredScope: scopesList, userRole, userId: context.userId },
          "Scope Check Failed: Insufficient role permissions"
        );
        throw new HttpError({
          code: "FORBIDDEN",
          message: `Insufficient role permissions. Role ${userRole} lacks required scope: ${scopesList.join(" or ")}`,
          statusCode: 403,
          details: {
            role: userRole,
            requiredScope: scopesList,
            grantedScopes: roleScopes
          }
        });
      }
      return;
    }

    const isAuthorized = scopesList.some((s) => hasScope(context.scopes, s));
    if (!isAuthorized) {
      request.log.warn(
        { requiredScope: scopesList, keyScopes: context.scopes, agentId: context.agentId },
        "Scope Check Failed: Insufficient API key scope"
      );
      throw new HttpError({
        code: "FORBIDDEN",
        message: `Insufficient API key scope. Required: ${scopesList.join(" or ")}`,
        statusCode: 403,
        details: {
          requiredScope: scopesList,
          providedScopes: context.scopes
        }
      });
    }
  };
};

