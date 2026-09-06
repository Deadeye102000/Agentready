import { PrismaClient } from "@agentready/db";
import { env } from "./env.js";

export const prisma = new PrismaClient({
  datasources: {
    db: {
      url: env.DATABASE_URL
    }
  }
});
