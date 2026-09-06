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

  it("enforces composite unique constraint on IdempotencyKey [organizationId, key]", async () => {
    const org1 = await ctx.prisma.organization.create({
      data: { name: "Idempotency Org 1", slug: `org-idemp-1-${Date.now()}` },
    });

    const org2 = await ctx.prisma.organization.create({
      data: { name: "Idempotency Org 2", slug: `org-idemp-2-${Date.now()}` },
    });

    const sharedKey = `idemp-key-${Date.now()}`;
    const expiresAt = new Date(Date.now() + 3600000);

    // First key for org1 succeeds
    const key1 = await ctx.prisma.idempotencyKey.create({
      data: {
        organizationId: org1.id,
        key: sharedKey,
        requestHash: "hash-1",
        route: "/api/v1/tool-calls/check",
        actorType: "AGENT",
        expiresAt,
      },
    });
    assert.ok(key1.id);

    // Duplicate key for the SAME organization (org1) must fail with P2002
    await assert.rejects(
      async () => {
        await ctx.prisma.idempotencyKey.create({
          data: {
            organizationId: org1.id,
            key: sharedKey,
            requestHash: "hash-2",
            route: "/api/v1/tool-calls/check",
            actorType: "AGENT",
            expiresAt,
          },
        });
      },
      (err: any) => {
        assert.ok(err instanceof Prisma.PrismaClientKnownRequestError);
        assert.equal(err.code, "P2002");
        return true;
      }
    );

    // The SAME key for a DIFFERENT organization (org2) must succeed (tenant-scoped composite uniqueness)
    const org2Key = await ctx.prisma.idempotencyKey.create({
      data: {
        organizationId: org2.id,
        key: sharedKey,
        requestHash: "hash-3",
        route: "/api/v1/tool-calls/check",
        actorType: "AGENT",
        expiresAt,
      },
    });
    assert.ok(org2Key.id);
  });

  it("enforces composite unique constraint on TaskContract [organizationId, name, version]", async () => {
    const org1 = await ctx.prisma.organization.create({
      data: { name: "Contract Org 1", slug: `org-contract-1-${Date.now()}` },
    });

    const org2 = await ctx.prisma.organization.create({
      data: { name: "Contract Org 2", slug: `org-contract-2-${Date.now()}` },
    });

    const project1 = await ctx.prisma.project.create({
      data: { organizationId: org1.id, name: "Project 1" },
    });

    const project2 = await ctx.prisma.project.create({
      data: { organizationId: org2.id, name: "Project 2" },
    });

    const contractName = "Compliance Contract";

    // First contract on org1 with version 1 succeeds
    const contract1 = await ctx.prisma.taskContract.create({
      data: {
        organizationId: org1.id,
        projectId: project1.id,
        name: contractName,
        version: 1,
        objective: "Validate compliance requirements",
      },
    });
    assert.ok(contract1.id);

    // Second contract on org1 with identical name and version must fail with P2002
    await assert.rejects(
      async () => {
        await ctx.prisma.taskContract.create({
          data: {
            organizationId: org1.id,
            projectId: project1.id,
            name: contractName,
            version: 1,
            objective: "Duplicate compliance contract",
          },
        });
      },
      (err: any) => {
        assert.ok(err instanceof Prisma.PrismaClientKnownRequestError);
        assert.equal(err.code, "P2002");
        return true;
      }
    );

    // Same contract name with version 2 on org1 succeeds
    const contract2 = await ctx.prisma.taskContract.create({
      data: {
        organizationId: org1.id,
        projectId: project1.id,
        name: contractName,
        version: 2,
        objective: "Validate compliance requirements v2",
      },
    });
    assert.ok(contract2.id);

    // Same contract name with version 1 on a DIFFERENT organization (org2) succeeds
    const org2Contract = await ctx.prisma.taskContract.create({
      data: {
        organizationId: org2.id,
        projectId: project2.id,
        name: contractName,
        version: 1,
        objective: "Org 2 compliance contract",
      },
    });
    assert.ok(org2Contract.id);
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

  it("enforces immutability on AuditLog: prevents direct UPDATE and DELETE, but allows Organization cascade", async () => {
    const org = await ctx.prisma.organization.create({
      data: { name: "Immutable Test Org", slug: `immutable-${Date.now()}` },
    });

    const log = await ctx.prisma.auditLog.create({
      data: {
        organizationId: org.id,
        actorType: "SYSTEM",
        action: "system.init",
        targetType: "system",
      },
    });

    // 1. Direct UPDATE must be rejected by the immutability trigger
    await assert.rejects(
      async () => {
        await ctx.prisma.$executeRawUnsafe(
          `UPDATE "AuditLog" SET action = 'tampered.action' WHERE id = '${log.id}'`
        );
      },
      (err: any) => {
        assert.match(err.message, /AuditLog records are immutable. Direct UPDATE operations are prohibited/);
        return true;
      }
    );

    // 2. Direct DELETE must be rejected by the immutability trigger
    await assert.rejects(
      async () => {
        await ctx.prisma.$executeRawUnsafe(
          `DELETE FROM "AuditLog" WHERE id = '${log.id}'`
        );
      },
      (err: any) => {
        assert.match(err.message, /AuditLog records are immutable. Direct DELETE operations are prohibited/);
        return true;
      }
    );

    // 3. Organization cascade DELETE must succeed
    await ctx.prisma.organization.delete({ where: { id: org.id } });
    const remaining = await ctx.prisma.auditLog.findUnique({ where: { id: log.id } });
    assert.equal(remaining, null);
  });
});

