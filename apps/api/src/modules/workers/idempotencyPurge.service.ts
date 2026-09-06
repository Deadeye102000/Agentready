import type { PrismaClient } from "@agentready/db";
import type { FastifyBaseLogger } from "fastify";
import type { AuditService } from "../audit/auditService.js";

export class IdempotencyPurgeService {
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(
    private readonly prisma: PrismaClient,
    private readonly audit?: AuditService,
    private readonly logger?: FastifyBaseLogger,
    private readonly intervalMs: number = 300_000 // Default 5 minutes
  ) {}

  /**
   * Deletes all idempotency keys whose expiration timestamp is less than or equal to cutoff.
   * Returns the count of deleted keys.
   */
  async purgeExpiredKeys(cutoff: Date = new Date()): Promise<number> {
    try {
      const result = await this.prisma.idempotencyKey.deleteMany({
        where: {
          expiresAt: {
            lte: cutoff
          }
        }
      });

      if (result.count > 0) {
        this.logger?.info(
          { purgedCount: result.count, cutoff: cutoff.toISOString() },
          "[IdempotencyPurge] Purged expired idempotency keys"
        );

        if (this.audit) {
          await this.audit.record({
            organizationId: "SYSTEM",
            source: "SYSTEM",
            action: "idempotency_keys.purged",
            resourceType: "IdempotencyKey",
            metadata: {
              purgedCount: result.count,
              cutoff: cutoff.toISOString()
            }
          });
        }
      }

      return result.count;
    } catch (err) {
      this.logger?.error({ err }, "[IdempotencyPurge] Failed to purge expired idempotency keys");
      return 0;
    }
  }

  /**
   * Starts the background periodic purge timer.
   */
  start() {
    if (this.timer) return;
    this.timer = setInterval(async () => {
      if (this.running) return;
      this.running = true;
      try {
        await this.purgeExpiredKeys();
      } finally {
        this.running = false;
      }
    }, this.intervalMs);
    this.timer.unref();
  }

  /**
   * Stops the background periodic purge timer.
   */
  stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }
}
