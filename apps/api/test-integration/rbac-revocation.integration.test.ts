/**
 * rbac-revocation.integration.test.ts
 *
 * Verifies the role revocation guarantee against REAL PostgreSQL (Testcontainers).
 *
 * Background: The mock-Prisma unit tests already cover this, but this project has
 * a specific history of mock and real DB disagreeing on exactly this class of guarantee
 * (see: round-2 audit). These tests re-run the same scenarios against a fresh ephemeral
 * Postgres to confirm the behaviour is not an artefact of the in-memory mock.
 *
 * Tests:
 * 1. ADMIN → VIEWER demotion mid-session: the very next request with the same JWT is rejected.
 * 2. Membership fully removed mid-session: the very next request with the same JWT is denied.
 * 3. AuditLog onDelete: Restrict: org deletion is blocked while audit logs exist.
 * 4. AuditLog immutability trigger: direct UPDATE and DELETE on AuditLog rows are blocked.
 */
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import type { FastifyInstance } from "fastify";
import { setupEphemeralPostgres, teardownEphemeralPostgres, type EphemeralPostgresContext } from "./setup/ephemeralPostgres.js";
import { buildServer } from "../src/server.js";
import { signSession } from "@agentready/auth";
import { env } from "../src/lib/env.js";

describe("Real PostgreSQL: Role Revocation & AuditLog Integrity Guarantees", () => {
  let ctx: EphemeralPostgresContext;
  let app: FastifyInstance;

  before(async () => {
    ctx = await setupEphemeralPostgres();
    app = await buildServer({ prisma: ctx.prisma });
  });

  after(async () => {
    if (app) await app.close().catch(() => {});
    await teardownEphemeralPostgres();
  });

  // -------------------------------------------------------------------------
  // Shared helpers
  // -------------------------------------------------------------------------
  const makeSessionCookie = (userId: string, organizationId: string) => {
    const token = signSession(
      { userId, organizationId, exp: Math.floor(Date.now() / 1000) + 3600 },
      env.AUTH_SESSION_SECRET
    );
    return `agentready_session=${token}`;
  };

  const seedOrgAndAdmin = async (suffix: string) => {
    const org = await ctx.prisma.organization.create({
      data: { name: `Revoke Test Org ${suffix}`, slug: `revoke-${suffix}-${Date.now()}` },
    });
    const user = await ctx.prisma.user.create({
      data: { email: `revoke-${suffix}-${Date.now()}@test.com`, name: "Test User", passwordHash: "hash" },
    });
    const agent = await ctx.prisma.agentIdentity.create({
      data: { organizationId: org.id, name: "Test Agent" },
    });
    const membership = await ctx.prisma.organizationMember.create({
      data: { organizationId: org.id, userId: user.id, role: "ADMIN" },
    });
    return { org, user, agent, membership };
  };

  // -------------------------------------------------------------------------
  // Test 1: ADMIN → VIEWER demotion mid-session
  // -------------------------------------------------------------------------
  it("rejects the next request after ADMIN role is demoted to VIEWER mid-session (real Postgres)", async () => {
    const { org, user, agent, membership } = await seedOrgAndAdmin("demotion");
    const cookie = makeSessionCookie(user.id, org.id);

    // Step 1: Confirm ADMIN can PUT /feature-flags
    const beforeRes = await app.inject({
      method: "PUT",
      url: "/api/v1/feature-flags",
      headers: { cookie },
      payload: { agentId: agent.id, capability: "file_write", state: "DISABLED" },
    });
    assert.notEqual(
      beforeRes.statusCode,
      403,
      `Expected ADMIN to be allowed before demotion, got ${beforeRes.statusCode}: ${beforeRes.body}`
    );

    // Step 2: Demote to VIEWER in REAL PostgreSQL (this is the key difference from mockPrisma tests)
    await ctx.prisma.organizationMember.update({
      where: { id: membership.id },
      data: { role: "VIEWER" },
    });

    // Step 3: Same token, same endpoint — must now be 403
    const afterRes = await app.inject({
      method: "PUT",
      url: "/api/v1/feature-flags",
      headers: { cookie },
      payload: { agentId: agent.id, capability: "file_write", state: "DISABLED" },
    });
    assert.equal(
      afterRes.statusCode,
      403,
      `Expected 403 after real-DB role demotion, got ${afterRes.statusCode}: ${afterRes.body}`
    );
    const body = JSON.parse(afterRes.body);
    assert.equal(body.error.code, "FORBIDDEN");
  });

  // -------------------------------------------------------------------------
  // Test 2: Membership fully removed mid-session
  // -------------------------------------------------------------------------
  it("denies access after membership is fully removed from real Postgres mid-session", async () => {
    const { org, user, agent, membership } = await seedOrgAndAdmin("removal");
    const cookie = makeSessionCookie(user.id, org.id);

    // Confirm initial access
    const beforeRes = await app.inject({
      method: "PUT",
      url: "/api/v1/feature-flags",
      headers: { cookie },
      payload: { agentId: agent.id, capability: "file_write", state: "DISABLED" },
    });
    assert.notEqual(beforeRes.statusCode, 403, `Expected ADMIN to pass initially, got ${beforeRes.statusCode}`);

    // Delete the membership from real Postgres
    await ctx.prisma.organizationMember.delete({ where: { id: membership.id } });

    // Same token — must be denied (401 or 403 are both correct)
    const afterRes = await app.inject({
      method: "PUT",
      url: "/api/v1/feature-flags",
      headers: { cookie },
      payload: { agentId: agent.id, capability: "file_write", state: "DISABLED" },
    });
    assert.ok(
      afterRes.statusCode === 401 || afterRes.statusCode === 403,
      `Expected 401 or 403 after membership removal, got ${afterRes.statusCode}: ${afterRes.body}`
    );
    const body = JSON.parse(afterRes.body);
    assert.ok(
      body.error.code === "UNAUTHORIZED" || body.error.code === "FORBIDDEN",
      `Expected UNAUTHORIZED or FORBIDDEN error code, got ${body.error.code}`
    );
  });

  // -------------------------------------------------------------------------
  // Test 3: AuditLog onDelete: Restrict blocks org deletion
  // -------------------------------------------------------------------------
  it("blocks org deletion in real Postgres when AuditLog rows exist (onDelete: Restrict)", async () => {
    const org = await ctx.prisma.organization.create({
      data: { name: "Restrict Test Org", slug: `restrict-test-${Date.now()}` },
    });

    // Insert an AuditLog row via raw SQL (no ORM relation requirements)
    await ctx.prisma.$executeRaw`
      INSERT INTO "AuditLog" (id, "organizationId", "actorType", action, "targetType", metadata, "createdAt")
      VALUES (gen_random_uuid(), ${org.id}, 'SYSTEM', 'ONBOARDING_STARTED', 'Organization', '{}', now())
    `;

    // Attempt to delete the org — must fail with FK Restrict violation
    await assert.rejects(
      async () => {
        await ctx.prisma.organization.delete({ where: { id: org.id } });
      },
      (err: any) => {
        // Prisma wraps FK violations as P2003 (foreign key constraint failed)
        // or P2014 (required relation violated), depending on version
        const isKnownError =
          err?.code === "P2003" ||
          err?.code === "P2014" ||
          (err?.message ?? "").includes("foreign key constraint") ||
          (err?.message ?? "").includes("violates foreign key");
        assert.ok(
          isKnownError,
          `Expected FK constraint error, got: ${err?.code} — ${err?.message?.slice(0, 200)}`
        );
        return true;
      }
    );
  });

  // -------------------------------------------------------------------------
  // Test 4: AuditLog immutability trigger in real Postgres
  // -------------------------------------------------------------------------
  it("blocks direct UPDATE and DELETE on AuditLog rows via trigger in real Postgres", async () => {
    const org = await ctx.prisma.organization.create({
      data: { name: "Trigger Test Org", slug: `trigger-test-${Date.now()}` },
    });

    // Insert a test audit log row
    const inserted: Array<{ id: string }> = await ctx.prisma.$queryRaw`
      INSERT INTO "AuditLog" (id, "organizationId", "actorType", action, "targetType", metadata, "createdAt")
      VALUES (gen_random_uuid(), ${org.id}, 'SYSTEM', 'TRIGGER_CHECK', 'SYSTEM', '{}', now())
      RETURNING id
    `;
    const logId = inserted[0].id;

    // UPDATE must be blocked
    await assert.rejects(
      async () => {
        await ctx.prisma.$executeRawUnsafe(
          `UPDATE "AuditLog" SET "action" = 'TAMPERED' WHERE id = '${logId}'`
        );
      },
      (err: any) => {
        assert.ok(
          (err?.message ?? "").includes("immutable"),
          `Expected immutable trigger message, got: ${err?.message?.slice(0, 200)}`
        );
        return true;
      }
    );

    // DELETE must be blocked
    await assert.rejects(
      async () => {
        await ctx.prisma.$executeRawUnsafe(`DELETE FROM "AuditLog" WHERE id = '${logId}'`);
      },
      (err: any) => {
        assert.ok(
          (err?.message ?? "").includes("immutable"),
          `Expected immutable trigger message, got: ${err?.message?.slice(0, 200)}`
        );
        return true;
      }
    );
  });
});
