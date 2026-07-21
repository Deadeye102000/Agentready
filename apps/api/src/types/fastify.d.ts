import type { PrismaClient } from "@agentready/db";
import type { AuthContext } from "../modules/auth/authService.js";

declare module "fastify" {
  interface FastifyInstance {
    prisma: PrismaClient;
  }

  interface FastifyRequest {
    authContext: AuthContext | null;
  }
}
