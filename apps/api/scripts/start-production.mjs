import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execSync, spawn } from "node:child_process";
import dotenv from "dotenv";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 1. Discover and load .env candidate if present
const candidates = [
  path.resolve(__dirname, "../../../.env"),
  path.resolve(process.cwd(), ".env"),
  path.resolve(process.cwd(), "../../.env")
];

for (const candidate of candidates) {
  if (fs.existsSync(candidate)) {
    dotenv.config({ path: candidate });
    break;
  }
}

// 2. Ensure DIRECT_URL fallback if DATABASE_URL is provided
if (process.env.DATABASE_URL && !process.env.DIRECT_URL) {
  process.env.DIRECT_URL = process.env.DATABASE_URL;
}

const schemaPath = path.resolve(__dirname, "../../../prisma/schema.prisma");

console.log("[Production Entrypoint] Running database migrations (prisma migrate deploy)...");

try {
  // Use pnpm exec prisma to ensure local workspace resolution
  execSync(`pnpm exec prisma migrate deploy --schema "${schemaPath}"`, {
    stdio: "inherit",
    env: process.env
  });
  console.log("[Production Entrypoint] Migrations verified and applied successfully.");
} catch (error) {
  console.error("[Production Entrypoint] CRITICAL: Database migration failed. Aborting startup.", error);
  process.exit(1);
}

console.log("[Production Entrypoint] Starting Fastify API server...");
const server = spawn("node", ["--import", "tsx", "dist/index.js"], {
  cwd: path.resolve(__dirname, ".."),
  stdio: "inherit",
  env: process.env
});

// Forward termination signals to the server process
process.on("SIGINT", () => server.kill("SIGINT"));
process.on("SIGTERM", () => server.kill("SIGTERM"));

server.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
  } else {
    process.exit(code ?? 0);
  }
});
