import fs from "node:fs";
import path from "node:path";
import { PrismaClient } from "../src/generated/prisma/client.js";

// Load .env file if DATABASE_URL is not already in environment
if (!process.env.DATABASE_URL && typeof process.loadEnvFile === "function") {
  const possiblePaths = [
    path.resolve(process.cwd(), ".env"),
    path.resolve(process.cwd(), "../../.env"),
    path.resolve(process.cwd(), "../.env"),
  ];
  for (const envPath of possiblePaths) {
    if (fs.existsSync(envPath)) {
      try {
        process.loadEnvFile(envPath);
        break;
      } catch {
        // Continue trying
      }
    }
  }
}

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("❌ DATABASE_URL is not set. Please copy .env.example to .env and configure your database URL.");
    process.exit(1);
  }

  // Obfuscate credentials in connection string for display
  const maskedUrl = url.replace(/(:\/\/[^:]+:)[^@]+(@)/, "$1*****$2");
  console.log(`🔍 Checking database connection to: ${maskedUrl}`);

  const startTime = Date.now();
  const prisma = new PrismaClient({
    datasources: {
      db: {
        url,
      },
    },
  });

  try {
    await prisma.$queryRaw<Array<{ result: number }>>`SELECT 1 as result`;
    const latency = Date.now() - startTime;
    console.log(`✅ Database is connected and healthy! (Roundtrip latency: ${latency}ms)`);
    process.exit(0);
  } catch (error: any) {
    console.error(`❌ Database connection failed:`, error.message || error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
