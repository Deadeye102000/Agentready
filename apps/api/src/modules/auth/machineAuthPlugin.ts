import type { FastifyReply, FastifyRequest } from "fastify";
import crypto from "crypto";
import { HttpError } from "../../lib/httpError.js";
import type { AuthContext } from "./authService.js";
import { API_KEY_SCOPES, type ApiKeyScope } from "./scopes.js";

const VALID_SCOPES = new Set<string>(API_KEY_SCOPES);

export function parseApiKeyScopes(scopes: unknown): ApiKeyScope[] {
  if (!Array.isArray(scopes)) {
    throw new HttpError({
      code: "INTERNAL_ERROR",
      message: `Invalid API key scopes stored in database: expected an array, received ${typeof scopes}`,
      statusCode: 500
    });
  }

  const validatedScopes: ApiKeyScope[] = [];
  for (const s of scopes) {
    if (typeof s !== "string" || !VALID_SCOPES.has(s)) {
      throw new HttpError({
        code: "INTERNAL_ERROR",
        message: `Invalid API key scope stored in database: "${String(s)}". Expected one of: ${API_KEY_SCOPES.join(", ")}`,
        statusCode: 500
      });
    }
    validatedScopes.push(s as ApiKeyScope);
  }

  return validatedScopes;
}

export const getMachineAuthContextFromRequest = async (request: FastifyRequest): Promise<AuthContext | null> => {
  const authHeader = request.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return null;
  }

  const rawKey = authHeader.replace("Bearer ", "").trim();
  const keyHash = crypto.createHash("sha256").update(rawKey).digest("hex");

  const apiKeyRecord = await request.server.prisma.apiKey.findFirst({
    where: {
      keyHash,
      revokedAt: null
    }
  });

  if (!apiKeyRecord) {
    throw new HttpError({
      code: "UNAUTHORIZED",
      message: "Invalid or revoked API key",
      statusCode: 401
    });
  }

  if (apiKeyRecord.expiresAt && apiKeyRecord.expiresAt < new Date()) {
    throw new HttpError({
      code: "UNAUTHORIZED",
      message: "Invalid or revoked API key",
      statusCode: 401
    });
  }

  // Asynchronously update lastUsedAt in the background without blocking the request pipeline
  request.server.prisma.apiKey.update({
    where: { id: apiKeyRecord.id },
    data: { lastUsedAt: new Date() }
  }).catch((err) => {
    request.log.error(`[Machine Auth] Failed to update lastUsedAt for API Key ${apiKeyRecord.id}: ${err.message}`);
  });

  const scopes = parseApiKeyScopes(apiKeyRecord.scopes);

  // Populate context for downstream tenant isolation
  return {
    organizationId: apiKeyRecord.organizationId,
    agentId: apiKeyRecord.agentId,
    actorType: "AGENT",
    scopes
  };
};

export const requireMachineAuth = async (request: FastifyRequest, reply: FastifyReply) => {
  if (request.authContext?.actorType === "USER") {
    throw new HttpError({
      code: "FORBIDDEN",
      message: "Machine authentication required. Human session users are not permitted.",
      statusCode: 403
    });
  }

  const context = await getMachineAuthContextFromRequest(request);
  if (!context) {
    throw new HttpError({
      code: "UNAUTHORIZED",
      message: "Missing or invalid Bearer token",
      statusCode: 401
    });
  }
  request.authContext = context;
};
