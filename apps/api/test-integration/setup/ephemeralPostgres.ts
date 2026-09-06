import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { PrismaClient } from "@agentready/db";
import { execSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const schemaPath = path.resolve(__dirname, "../../../../prisma/schema.prisma");

export const CONCURRENCY_WORKER_COUNT = 10;
export const CONNECTION_LIMIT = 20; // Explicitly >= worker count to force genuinely parallel connections

let container: StartedPostgreSqlContainer | null = null;
let prisma: PrismaClient | null = null;

export type EphemeralPostgresContext = {
  container: StartedPostgreSqlContainer;
  prisma: PrismaClient;
  connectionUrl: string;
};

/**
 * Provisions a real ephemeral PostgreSQL instance using Testcontainers (postgres:16-alpine).
 * Docker is a hard requirement for running this suite; Ryuk handles cleanup on crash.
 */
export async function setupEphemeralPostgres(): Promise<EphemeralPostgresContext> {
  if (container && prisma) {
    const baseUri = container.getConnectionUri();
    const connectionUrl = `${baseUri}${baseUri.includes("?") ? "&" : "?"}connection_limit=${CONNECTION_LIMIT}`;
    return { container, prisma, connectionUrl };
  }

  // Spin up real postgres:16-alpine container
  container = await new PostgreSqlContainer("postgres:16-alpine")
    .withDatabase("agentready_test")
    .withUsername("test_user")
    .withPassword("test_password")
    .start();

  const baseUri = container.getConnectionUri();
  // Ensure connection_limit is set on connection string to at least worker count
  const connectionUrl = `${baseUri}${baseUri.includes("?") ? "&" : "?"}connection_limit=${CONNECTION_LIMIT}`;

  process.env.DATABASE_URL = connectionUrl;
  process.env.DIRECT_URL = connectionUrl;

  // Synchronize database schema using prisma db push
  execSync(`npx prisma db push --schema "${schemaPath}" --skip-generate`, {
    stdio: "pipe",
    env: {
      ...process.env,
      DATABASE_URL: connectionUrl,
      DIRECT_URL: connectionUrl,
    },
  });

  prisma = new PrismaClient({
    datasources: {
      db: {
        url: connectionUrl,
      },
    },
  });

  await prisma.$connect();

  return { container, prisma, connectionUrl };
}

/**
 * Explicit afterAll teardown for normal test completion.
 */
export async function teardownEphemeralPostgres(): Promise<void> {
  if (prisma) {
    await prisma.$disconnect().catch(() => {});
    prisma = null;
  }
  if (container) {
    await container.stop().catch(() => {});
    container = null;
  }
}
