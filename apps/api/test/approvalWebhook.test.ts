import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import crypto from "node:crypto";
import { ApprovalWebhookService } from "../src/modules/governance/approvalWebhookService.js";
import { GovernanceRepository } from "../src/modules/governance/governanceRepository.js";
import { mockPrisma, mockStore } from "./mockPrisma.js";

describe("Approval Webhook Notification Tests", () => {
  let server: http.Server | null = null;
  let serverPort: number;
  let receivedRequests: Array<{
    headers: http.IncomingHttpHeaders;
    body: any;
    rawBody: string;
  }> = [];
  let serverHandler: (req: http.IncomingMessage, res: http.ServerResponse) => void;

  const originalWebhookUrl = process.env.APPROVAL_WEBHOOK_URL;
  const originalWebhookSecret = process.env.APPROVAL_WEBHOOK_SECRET;
  const originalNodeEnv = process.env.NODE_ENV;
  const TEST_SECRET = "test_webhook_secret_key_12345";

  beforeEach(async () => {
    receivedRequests = [];
    serverHandler = (req, res) => {
      let data = "";
      req.on("data", (chunk) => (data += chunk));
      req.on("end", () => {
        try {
          receivedRequests.push({
            headers: req.headers,
            body: JSON.parse(data),
            rawBody: data
          });
        } catch {
          receivedRequests.push({
            headers: req.headers,
            body: null,
            rawBody: data
          });
        }
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: true }));
      });
    };

    server = http.createServer((req, res) => serverHandler(req, res));
    await new Promise<void>((resolve) => {
      server!.listen(0, "127.0.0.1", () => {
        const addr = server!.address() as any;
        serverPort = addr.port;
        resolve();
      });
    });

    process.env.APPROVAL_WEBHOOK_URL = `http://127.0.0.1:${serverPort}/webhook`;
    process.env.APPROVAL_WEBHOOK_SECRET = TEST_SECRET;
    process.env.NODE_ENV = "test";
  });

  afterEach(async () => {
    process.env.APPROVAL_WEBHOOK_URL = originalWebhookUrl;
    process.env.APPROVAL_WEBHOOK_SECRET = originalWebhookSecret;
    process.env.NODE_ENV = originalNodeEnv;

    if (server) {
      await new Promise<void>((resolve) => server!.close(() => resolve()));
      server = null;
    }
  });

  it("1. Webhook dedup: exactly one webhook fires per created ApprovalRequest row", async () => {
    const govRepo = new GovernanceRepository(mockPrisma as any);

    // Insert an approval request
    await govRepo.createApprovalRequest({
      organizationId: "org-1",
      agentId: "agent-1",
      requestedAction: "issue_refund",
      reason: "High risk refund requires human sign-off",
      payload: { executionId: "exec-100", amount: 9500 },
      status: "PENDING"
    });

    // Wait for async dispatch
    await new Promise((r) => setTimeout(r, 100));

    assert.equal(receivedRequests.length, 1, "Expected exactly 1 webhook request to be dispatched");
    const req = receivedRequests[0];
    assert.equal(req.body.event, "approval.created");
    assert.equal(req.body.organizationId, "org-1");
    assert.equal(req.body.requestedAction, "issue_refund");
    assert.equal(req.body.executionId, "exec-100");
  });

  it("2. Exact HMAC-SHA256 signature verification matching receiver recipe", async () => {
    const govRepo = new GovernanceRepository(mockPrisma as any);

    await govRepo.createApprovalRequest({
      organizationId: "org-1",
      agentId: "agent-1",
      requestedAction: "drop_database",
      reason: "Dangerous DB operation",
      payload: { executionId: "exec-200" },
      status: "PENDING"
    });

    await new Promise((r) => setTimeout(r, 100));

    assert.equal(receivedRequests.length, 1);
    const { headers, rawBody } = receivedRequests[0];

    const sigHeader = headers["x-agentready-signature"] as string;
    const timestamp = headers["x-agentready-timestamp"] as string;
    const eventId = headers["x-agentready-event-id"] as string;

    assert.ok(sigHeader, "x-agentready-signature header is required");
    assert.ok(timestamp, "x-agentready-timestamp header is required");
    assert.ok(eventId, "x-agentready-event-id header is required");
    assert.match(sigHeader, /^sha256=[a-f0-9]{64}$/);

    // Receiver Verification Algorithm
    const expectedSig =
      "sha256=" +
      crypto
        .createHmac("sha256", TEST_SECRET)
        .update(`${timestamp}.${rawBody}`)
        .digest("hex");

    assert.equal(sigHeader, expectedSig, "HMAC-SHA256 signature must match computed digest");

    // Replay defense: verify timestamp is within tolerance
    const deltaMs = Math.abs(Date.now() - parseInt(timestamp, 10));
    assert.ok(deltaMs < 5 * 60 * 1000, "Timestamp must be within 5 minutes");
  });

  it("3. Exhausted retries write an immutable AuditLog entry", async () => {
    // Make webhook server fail with 500
    serverHandler = (_req, res) => {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Internal Server Error" }));
    };

    const webhookService = new ApprovalWebhookService(mockPrisma as any);

    await webhookService.dispatch("approval.created", {
      id: "appr-fail-test",
      organizationId: "org-1",
      agentId: "agent-1",
      requestedAction: "transfer_funds",
      reason: "Suspicious fund transfer",
      status: "PENDING",
      payload: { executionId: "exec-fail" }
    });

    const failedAudit = mockStore.auditLogs.find(
      (a) =>
        a.action === "approval.webhook_delivery_failed" &&
        a.targetId === "appr-fail-test"
    );

    assert.ok(failedAudit, "Expected approval.webhook_delivery_failed audit record to be created");
    assert.equal(failedAudit.targetType, "ApprovalRequest");
    assert.equal(failedAudit.organizationId, "org-1");
    assert.equal((failedAudit.metadata as any).attempts, 4);
    assert.equal((failedAudit.metadata as any).lastStatusCode, 500);
  });
});
