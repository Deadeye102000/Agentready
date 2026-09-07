#!/usr/bin/env tsx
/**
 * scripts/generate-sandbox-key.ts
 *
 * CLI utility to generate and persist a production-ready SANDBOX_AGENT_API_KEY
 * for the AgentReady web sandbox controller.
 *
 * Usage:
 *   pnpm generate:sandbox-key
 *   pnpm generate:sandbox-key --org my-org-slug
 */

import crypto from "node:crypto";
import { PrismaClient } from "../packages/db/src/generated/prisma/client.js";

const prisma = new PrismaClient();

const SANDBOX_REQUIRED_SCOPES = [
  "executions:read",
  "executions:write",
  "traces:read",
  "traces:write",
  "tool_calls:check",
  "tool_calls:result",
  "governance:read",
  "eval:read",
  "eval:write",
  "contracts:read",
  "observability:read",
  "audit:read"
];

async function main() {
  const args = process.argv.slice(2);
  const orgIndex = args.indexOf("--org");
  const targetOrgSlug = orgIndex !== -1 ? args[orgIndex + 1] : undefined;

  console.log("\n========================================================");
  console.log("  AgentReady Production Sandbox API Key Generator");
  console.log("========================================================\n");

  // 1. Resolve Organization
  let organization;
  if (targetOrgSlug) {
    organization = await prisma.organization.findUnique({
      where: { slug: targetOrgSlug }
    });
    if (!organization) {
      console.error(`Error: Organization with slug '${targetOrgSlug}' not found.`);
      process.exit(1);
    }
  } else {
    organization = await prisma.organization.findFirst({
      orderBy: { createdAt: "asc" }
    });
    if (!organization) {
      console.error("Error: No organizations found in database. Run 'pnpm db:seed' first.");
      process.exit(1);
    }
  }

  console.log(`Target Organization: ${organization.name} (id: ${organization.id}, slug: ${organization.slug})`);

  // 2. Resolve or Create Agent Identity
  let agent = await prisma.agentIdentity.findFirst({
    where: { organizationId: organization.id, name: "Production Sandbox Agent" }
  });

  if (!agent) {
    agent = await prisma.agentIdentity.findFirst({
      where: { organizationId: organization.id }
    });
  }

  if (!agent) {
    agent = await prisma.agentIdentity.create({
      data: {
        organizationId: organization.id,
        name: "Production Sandbox Agent"
      }
    });
    console.log(`Created new AgentIdentity: ${agent.name} (id: ${agent.id})`);
  } else {
    console.log(`Using existing AgentIdentity: ${agent.name} (id: ${agent.id})`);
  }

  // 3. Generate Cryptographic Secret
  const randomBytes = crypto.randomBytes(24).toString("base64url");
  const rawKey = `ar_live_${randomBytes}`;
  const keyHash = crypto.createHash("sha256").update(rawKey).digest("hex");
  const keyPrefix = `ar_live_${randomBytes.substring(0, 6)}`;

  // 4. Persist ApiKey record
  const apiKeyRecord = await prisma.apiKey.create({
    data: {
      organizationId: organization.id,
      agentId: agent.id,
      name: `Production Sandbox Key (${new Date().toISOString().split("T")[0]})`,
      keyPrefix,
      keyHash,
      scopes: SANDBOX_REQUIRED_SCOPES
    }
  });

  // 5. Output Instructions
  console.log("\n--------------------------------------------------------");
  console.log("  SUCCESS: Generated and Persisted API Key in PostgreSQL");
  console.log("--------------------------------------------------------\n");
  console.log(`  Key ID:     ${apiKeyRecord.id}`);
  console.log(`  Key Prefix: ${keyPrefix}`);
  console.log(`  Raw Secret: ${rawKey}\n`);
  console.log("--------------------------------------------------------");
  console.log("  ACTION REQUIRED FOR OPERATORS:");
  console.log("--------------------------------------------------------");
  console.log("  Set this environment variable in your production host");
  console.log("  (Vercel, Render, ECS, or .env.production):\n");
  console.log(`  SANDBOX_AGENT_API_KEY="${rawKey}"\n`);
  console.log("========================================================\n");
}

main()
  .catch((err) => {
    console.error("Fatal error generating sandbox key:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
