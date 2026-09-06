import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { setupEphemeralPostgres, teardownEphemeralPostgres, type EphemeralPostgresContext } from "./setup/ephemeralPostgres.js";
import { Prisma } from "@agentready/db";

describe("Real PostgreSQL: Composite Unique Constraints & Foreign Key Cascades", () => {
  let ctx: EphemeralPostgresContext;

  before(async () => {
    ctx = await setupEphemeralPostgres();
  });

  after(async () => {
    await teardownEphemeralPostgres();
  });

  it("enforces unique constraint on ApiKey.keyHash in real PostgreSQL", async () => {
    const org = await ctx.prisma.organization.create({
      data: { name: "Test Org Constraints", slug: `org-constraints-${Date.now()}` },
    });

    const agent = await ctx.prisma.agentIdentity.create({
      data: { organizationId: org.id, name: "Test Agent" },
    });

    const duplicateHash = crypto.createHash("sha256").update(`ar_test_${Date.now()}`).digest("hex");

    // First key should succeed
    const key1 = await ctx.prisma.apiKey.create({
      data: {
        organizationId: org.id,
        agentId: agent.id,
        name: "First Key",
        keyPrefix: "ar_test_",
        keyHash: duplicateHash,
        scopes: ["all"],
      },
    });
    assert.ok(key1.id);

    // Second key with identical keyHash must fail with real PostgreSQL P2002 unique constraint violation
    await assert.rejects(
      async () => {
        await ctx.prisma.apiKey.create({
          data: {
            organizationId: org.id,
            agentId: agent.id,
            name: "Second Key Duplicate",
            keyPrefix: "ar_test_",
            keyHash: duplicateHash,
            scopes: ["all"],
          },
        });
      },
      (err: any) => {
        assert.ok(err instanceof Prisma.PrismaClientKnownRequestError);
        assert.equal(err.code, "P2002");
        assert.ok(JSON.stringify(err.meta).includes("keyHash"));
        return true;
      }
    );
  });

  it("enforces composite unique constraint on IdempotencyKey [executionId, key]", async () => {
    const org = await ctx.prisma.organization.create({
      data: { name: "Idempotency Org", slug: `org-idemp-${Date.now()}` },
    });

    const agent = await ctx.prisma.agentIdentity.create({
      data: { organizationId: org.id, name: "Idemp Agent" },
    });

    const exec1 = await ctx.prisma.agentExecution.create({
      data: {
        organizationId: org.id,
        agentId: agent.id,
        objective: "Execution 1",
        input: {},
        status: "RUNNING",
      },
    });

    const exec2 = await ctx.prisma.agentExecution.create({
      data: {
        organizationId: org.id,
        agentId: agent.id,
        objective: "Execution 2",
        input: {},
        status: "RUNNING",
      },
    });

    const sharedKey = `idemp-key-${Date.now()}`;

    // First key for exec1 succeeds
    await ctx.prisma.idempotencyKey.create({
      data: {
        organizationId: org.id,
        executionId: exec1.id,
        key: sharedKey,
        requestHash: "hash-1",
        route: "/api/v1/tool-calls/check",
        actorType: "AGENT",
      },
    });

    // Duplicate key for the SAME execution (exec1) must fail with P2002
    await assert.rejects(
      async () => {
        await ctx.prisma.idempotencyKey.create({
          data: {
            organizationId: org.id,
            executionId: exec1.id,
            key: sharedKey,
            requestHash: "hash-2",
            route: "/api/v1/tool-calls/check",
            actorType: "AGENT",
          },
        });
      },
      (err: any) => {
        assert.ok(err instanceof Prisma.PrismaClientKnownRequestError);
        assert.equal(err.code, "P2002");
        return true;
      }
    );

    // The SAME key for a DIFFERENT execution (exec2) must succeed (composite uniqueness)
    const exec2Key = await ctx.prisma.idempotencyKey.create({
      data: {
        organizationId: org.id,
        executionId: exec2.id,
        key: sharedKey,
        requestHash: "hash-3",
        route: "/api/v1/tool-calls/check",
        actorType: "AGENT",
      },
    });
    assert.ok(exec2Key.id);
  });

  it("enforces composite unique constraint on ToolCallTrace [executionId, toolCallId]", async () => {
    const org = await ctx.prisma.organization.create({
      data: { name: "Trace Org", slug: `org-trace-${Date.now()}` },
    });

    const agent = await ctx.prisma.agentIdentity.create({
      data: { organizationId: org.id, name: "Trace Agent" },
    });

    const exec = await ctx.prisma.agentExecution.create({
      data: {
        organizationId: org.id,
        agentId: agent.id,
        objective: "Trace Execution",
        input: {},
        status: "RUNNING",
      },
    });

    const toolCallId = "call_abc_123";

    // First trace with this toolCallId succeeds
    await ctx.prisma.toolCallTrace.create({
      data: {
        organizationId: org.id,
        executionId: exec.id,
        toolCallId,
        toolName: "database_query",
        status: "PENDING",
      },
    });

    // Second trace with the identical toolCallId for the same execution fails with P2002
    await assert.rejects(
      async () => {
        await ctx.prisma.toolCallTrace.create({
          data: {
            organizationId: org.id,
            executionId: exec.id,
            toolCallId,
            toolName: "database_query",
            status: "PENDING",
          },
        });
      },
      (err: any) => {
        assert.ok(err instanceof Prisma.PrismaClientKnownRequestError);
        assert.equal(err.code, "P2002");
        return true;
      }
    );
  });

  it("retains AuditLog records on User and Agent deletion (onDelete: SetNull), but cascades on Organization deletion", async () => {
    // 1. Create Organization, User, and Agent
    const org = await ctx.prisma.organization.create({
      data: { name: "Audit Retention Org", slug: `org-audit-${Date.now()}` },
    });

    const user = await ctx.prisma.user.create({
      data: {
        email: `audited-user-${Date.now()}@example.com`,
        name: "Audited User",
        passwordHash: "hash123",
      },
    });

    const agent = await ctx.prisma.agentIdentity.create({
      data: { organizationId: org.id, name: "Audited Agent" },
    });

    // 2. Create AuditLogs linked to User and Agent
    const userLog = await ctx.prisma.auditLog.create({
      data: {
        organizationId: org.id,
        actorType: "USER",
        actorUserId: user.id,
        action: "user.action",
        targetType: "resource",
      },
    });

    const agentLog = await ctx.prisma.auditLog.create({
      data: {
        organizationId: org.id,
        actorType: "AGENT",
        actorAgentId: agent.id,
        action: "agent.action",
        targetType: "resource",
      },
    });

    // 3. Delete the User: The audit log MUST be retained, with actorUserId set to NULL
    await ctx.prisma.user.delete({ where: { id: user.id } });
    const retainedUserLog = await ctx.prisma.auditLog.findUnique({ where: { id: userLog.id } });
    assert.ok(retainedUserLog, "AuditLog must NOT be deleted when the actor User is deleted");
    assert.equal(retainedUserLog.actorUserId, null, "actorUserId must be set to null on User deletion");

    // 4. Delete the Agent: The audit log MUST be retained, with actorAgentId set to NULL
    await ctx.prisma.agentIdentity.delete({ where: { id: agent.id } });
    const retainedAgentLog = await ctx.prisma.auditLog.findUnique({ where: { id: agentLog.id } });
    assert.ok(retainedAgentLog, "AuditLog must NOT be deleted when the actor Agent is deleted");
    assert.equal(retainedAgentLog.actorAgentId, null, "actorAgentId must be set to null on Agent deletion");

    // 5. Delete the Organization: Tenant data purge cascades all tenant-scoped logs
    await ctx.prisma.organization.delete({ where: { id: org.id } });
    const purgedLogs = await ctx.prisma.auditLog.findMany({ where: { organizationId: org.id } });
    assert.equal(purgedLogs.length, 0, "AuditLogs cascade-delete when the tenant organization is deleted");
  });
});
