import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { setupEphemeralPostgres, teardownEphemeralPostgres, CONCURRENCY_WORKER_COUNT, type EphemeralPostgresContext } from "./setup/ephemeralPostgres.js";
import { PrismaClient } from "@agentready/db";

describe("Real PostgreSQL: Concurrent Execution Poller Atomic updateMany", () => {
  let ctx: EphemeralPostgresContext;

  before(async () => {
    ctx = await setupEphemeralPostgres();
  });

  after(async () => {
    await teardownEphemeralPostgres();
  });

  it("guarantees atomic single-claim behavior across parallel workers under high concurrent load", async () => {
    const org = await ctx.prisma.organization.create({
      data: { name: "Concurrency Org", slug: `org-concurrency-${Date.now()}` },
    });

    const agent = await ctx.prisma.agentIdentity.create({
      data: { organizationId: org.id, name: "Concurrency Agent" },
    });

    const project = await ctx.prisma.project.create({
      data: { organizationId: org.id, name: "Concurrency Project" },
    });

    // 1. Seed 20 QUEUED executions in real PostgreSQL
    const TOTAL_EXECUTIONS = 20;
    const executionIds: string[] = [];

    for (let i = 0; i < TOTAL_EXECUTIONS; i++) {
      const exec = await ctx.prisma.agentExecution.create({
        data: {
          organizationId: org.id,
          projectId: project.id,
          agentId: agent.id,
          objective: `Concurrent Test Objective ${i}`,
          input: { index: i },
          status: "QUEUED",
          attemptCount: 0,
        },
      });
      executionIds.push(exec.id);
    }

    assert.equal(executionIds.length, TOTAL_EXECUTIONS);

    // 2. Initialize separate PrismaClient instances for each worker to simulate genuine parallel processes/connections
    const workerClients: PrismaClient[] = [];
    for (let w = 0; w < CONCURRENCY_WORKER_COUNT; w++) {
      const client = new PrismaClient({
        datasources: {
          db: {
            url: ctx.connectionUrl,
          },
        },
      });
      await client.$connect();
      workerClients.push(client);
    }

    // 3. Launch all workers simultaneously to race to claim the executions
    // Track which executions were claimed by which worker
    const claimsByWorker: Map<number, string[]> = new Map();
    for (let w = 0; w < CONCURRENCY_WORKER_COUNT; w++) {
      claimsByWorker.set(w, []);
    }

    const workerTasks = workerClients.map((client, workerIndex) => {
      return (async () => {
        // Shuffle the execution IDs slightly for each worker to simulate real-world varied arrival order
        const shuffled = [...executionIds].sort(() => Math.random() - 0.5);

        for (const execId of shuffled) {
          // Atomic database updateMany: only succeeds if status is still QUEUED
          const result = await client.agentExecution.updateMany({
            where: {
              id: execId,
              status: "QUEUED",
            },
            data: {
              status: "RUNNING",
              startedAt: new Date(),
              attemptCount: 1,
            },
          });

          if (result.count === 1) {
            claimsByWorker.get(workerIndex)!.push(execId);
          }
        }
      })();
    });

    // Await all parallel workers to complete
    await Promise.all(workerTasks);

    // Cleanup worker clients
    await Promise.all(workerClients.map((c) => c.$disconnect()));

    // 4. Verification of Concurrency Invariants
    const allClaimedIds: string[] = [];
    let totalSuccessfulClaims = 0;

    for (let w = 0; w < CONCURRENCY_WORKER_COUNT; w++) {
      const claimed = claimsByWorker.get(w)!;
      totalSuccessfulClaims += claimed.length;
      allClaimedIds.push(...claimed);
    }

    // Invariant 1: Total successful claims across all workers must equal exactly the total queued count
    assert.equal(
      totalSuccessfulClaims,
      TOTAL_EXECUTIONS,
      `Expected exactly ${TOTAL_EXECUTIONS} total claims, but got ${totalSuccessfulClaims}`
    );

    // Invariant 2: Every execution was claimed exactly once (no duplicates, no double-claiming)
    const uniqueClaimedIds = new Set(allClaimedIds);
    assert.equal(
      uniqueClaimedIds.size,
      TOTAL_EXECUTIONS,
      "Duplicate claims detected! Some executions were claimed more than once."
    );

    // Invariant 3: In PostgreSQL, all executions must now be RUNNING
    const updatedExecutions = await ctx.prisma.agentExecution.findMany({
      where: {
        id: { in: executionIds },
      },
      select: {
        id: true,
        status: true,
        attemptCount: true,
      },
    });

    assert.equal(updatedExecutions.length, TOTAL_EXECUTIONS);
    for (const exec of updatedExecutions) {
      assert.equal(exec.status, "RUNNING", `Execution ${exec.id} should be RUNNING`);
      assert.equal(exec.attemptCount, 1, `Execution ${exec.id} attemptCount should be 1`);
    }
  });
});
