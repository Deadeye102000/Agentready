import type { FastifyReply, FastifyRequest } from "fastify";
import crypto from "crypto";
import { HttpError } from "../../lib/httpError.js";
import type { AuthContext } from "./authService.js";

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

  // Populate context for downstream tenant isolation
  return {
    organizationId: apiKeyRecord.organizationId,
    agentId: apiKeyRecord.agentId,
    actorType: "AGENT",
    role: "AGENT"
  };
};

export const requireMachineAuth = async (request: FastifyRequest, reply: FastifyReply) => {
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
