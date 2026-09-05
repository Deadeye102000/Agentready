import type { FastifyRequest } from "fastify";
import { HttpError } from "../../lib/httpError.js";

export const API_KEY_SCOPES = [
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
] as const;

export type ApiKeyScope = (typeof API_KEY_SCOPES)[number];

/**
 * Checks whether the given list of scopes satisfies a required scope.
 * Supports:
 * - "admin", "all", "*" wildcard full access
 * - Exact scope match (e.g. "executions:read")
 * - Resource wildcard match (e.g. "executions:*" matches "executions:read" and "executions:write")
 */
export function hasScope(grantedScopes: string[] | undefined, requiredScope: string): boolean {
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
 * Fastify preHandler hook enforcing that Bearer-authenticated API key requests
 * possess at least one of the required scopes.
 *
 * NOTE: Session-authenticated human users (actorType === "USER") are unaffected by
 * API key scope restrictions and continue through standard RBAC.
 */
export const requireScope = (requiredScope: string | string[]) => {
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

    // Session-authenticated human users are unaffected
    if (context.actorType === "USER" || !context.scopes) {
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
