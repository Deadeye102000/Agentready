import crypto from "crypto";
import type { PrismaClient } from "@agentready/db";
import { HttpError } from "../../lib/httpError.js";

export class ApiKeyService {
  constructor(private readonly prisma: PrismaClient) {}

  async createApiKey(organizationId: string, name: string) {
    const randomBytes = crypto.randomBytes(24).toString("base64url");
    const rawKey = `ar_live_${randomBytes}`;
    const keyHash = crypto.createHash("sha256").update(rawKey).digest("hex");
    const keyPrefix = `ar_live_${randomBytes.substring(0, 6)}`;

    // Resolve or create a default AgentIdentity since agentId is required in the DB schema
    let agent = await this.prisma.agentIdentity.findFirst({
      where: { organizationId }
    });

    if (!agent) {
      agent = await this.prisma.agentIdentity.create({
        data: {
          organizationId,
          name: "Default Agent"
        }
      });
    }

    const apiKeyRecord = await this.prisma.apiKey.create({
      data: {
        organizationId,
        agentId: agent.id,
        name,
        keyPrefix,
        keyHash,
        scopes: ["all"]
      }
    });

    return { rawKey, apiKeyRecord };
  }

  async listApiKeys(organizationId: string) {
    return this.prisma.apiKey.findMany({
      where: { organizationId },
      select: {
        id: true,
        organizationId: true,
        agentId: true,
        name: true,
        keyPrefix: true,
        scopes: true,
        expiresAt: true,
        lastUsedAt: true,
        revokedAt: true,
        createdAt: true,
        updatedAt: true
      },
      orderBy: { createdAt: "desc" }
    });
  }

  async revokeApiKey(organizationId: string, keyId: string) {
    const key = await this.prisma.apiKey.findFirst({
      where: { id: keyId, organizationId }
    });

    if (!key) {
      throw new HttpError({
        code: "NOT_FOUND",
        message: "API key not found",
        statusCode: 404
      });
    }

    return this.prisma.apiKey.update({
      where: { id: keyId },
      data: { revokedAt: new Date() }
    });
  }
}
