import { PrismaClient } from "@agentready/db";

const prisma = new PrismaClient({
    datasourceUrl: "postgresql://postgres:postgres@localhost:5432/postgres?schema=public"
});

async function main() {
  const result = await prisma.agentFeatureFlag.findUnique({
    where: {
      organizationId_agentId_capability: {
        organizationId: "org1",
        agentId: null,
        capability: "tool_execution"
      }
    }
  });
  console.log(result);
}

main().catch(console.error).finally(() => prisma.$disconnect());
