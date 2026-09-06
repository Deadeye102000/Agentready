import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { mockPrisma, mockStore, resetMockStore } from "./mockPrisma.js";
import { AuditRepository } from "../src/modules/audit/auditRepository.js";
import { AuditService } from "../src/modules/audit/auditService.js";
import { IdempotencyPurgeService } from "../src/modules/workers/idempotencyPurge.service.js";

describe("IdempotencyPurgeService", () => {
  let auditService: AuditService;
  let purgeService: IdempotencyPurgeService;

  beforeEach(() => {
    resetMockStore();
    auditService = new AuditService(new AuditRepository(mockPrisma as any));
    purgeService = new IdempotencyPurgeService(mockPrisma as any, auditService);
  });

  it("purges expired keys older than cutoff and leaves valid keys intact", async () => {
    const now = new Date();
    const expiredTimestamp = new Date(now.getTime() - 60_000); // 1 min ago
    const futureTimestamp = new Date(now.getTime() + 3_600_000); // 1 hour ahead

    // Seed expired key
    mockStore.idempotencyKeys.push({
      id: "key-expired-1",
      organizationId: "org-1",
      key: "idemp-exp-1",
      requestHash: "hash-1",
      route: "/test",
      actorType: "AGENT",
      responseStatus: 200,
      expiresAt: expiredTimestamp,
      createdAt: new Date(),
      updatedAt: new Date()
    });

    // Seed another expired key
    mockStore.idempotencyKeys.push({
      id: "key-expired-2",
      organizationId: "org-1",
      key: "idemp-exp-2",
      requestHash: "hash-2",
      route: "/test",
      actorType: "AGENT",
      responseStatus: 200,
      expiresAt: expiredTimestamp,
      createdAt: new Date(),
      updatedAt: new Date()
    });

    // Seed active key
    mockStore.idempotencyKeys.push({
      id: "key-active-1",
      organizationId: "org-1",
      key: "idemp-active-1",
      requestHash: "hash-3",
      route: "/test",
      actorType: "AGENT",
      responseStatus: 200,
      expiresAt: futureTimestamp,
      createdAt: new Date(),
      updatedAt: new Date()
    });

    assert.equal(mockStore.idempotencyKeys.length, 3);

    const purgedCount = await purgeService.purgeExpiredKeys(now);

    assert.equal(purgedCount, 2);
    assert.equal(mockStore.idempotencyKeys.length, 1);
    assert.equal(mockStore.idempotencyKeys[0].id, "key-active-1");

    // Verify audit log record created
    const purgeAudit = mockStore.auditLogs.find((l) => l.action === "idempotency_keys.purged");
    assert.ok(purgeAudit, "Audit record for idempotency key purge should exist");
    assert.equal(purgeAudit.metadata.purgedCount, 2);
  });

  it("returns 0 and does not emit audit log when no keys are expired", async () => {
    const now = new Date();
    const futureTimestamp = new Date(now.getTime() + 3_600_000);

    mockStore.idempotencyKeys.push({
      id: "key-active-2",
      organizationId: "org-1",
      key: "idemp-active-2",
      requestHash: "hash-4",
      route: "/test",
      actorType: "AGENT",
      responseStatus: 200,
      expiresAt: futureTimestamp,
      createdAt: new Date(),
      updatedAt: new Date()
    });

    const purgedCount = await purgeService.purgeExpiredKeys(now);

    assert.equal(purgedCount, 0);
    assert.equal(mockStore.idempotencyKeys.length, 1);

    const purgeAudit = mockStore.auditLogs.find((l) => l.action === "idempotency_keys.purged");
    assert.equal(purgeAudit, undefined);
  });

  it("manages start and stop timer lifecycles cleanly", () => {
    purgeService.start();
    // Starting twice should be a no-op
    purgeService.start();
    purgeService.stop();
    // Stopping twice should be a no-op
    purgeService.stop();
  });
});
