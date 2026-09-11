import crypto from "node:crypto";
import type { PrismaClient } from "@agentready/db";

export interface ApprovalWebhookPayload {
  eventId: string;
  event: "approval.created" | "approval.reviewed";
  timestamp: string;
  organizationId: string;
  approvalRequestId: string;
  executionId: string | null;
  agentId: string | null;
  requestedAction: string;
  reason: string | null;
  status: string;
  reviewedBy?: string | null;
  reviewComment?: string | null;
  payload?: any;
}

export class ApprovalWebhookService {
  constructor(private readonly prisma: PrismaClient) {}

  dispatch(event: "approval.created" | "approval.reviewed", approvalRequest: any): Promise<void> {
    const webhookUrl = process.env.APPROVAL_WEBHOOK_URL;
    if (!webhookUrl || webhookUrl.trim() === "") {
      return Promise.resolve();
    }

    const eventId = crypto.randomUUID();
    const timestamp = Date.now().toString();

    let executionId: string | null = null;
    let payloadData: any = null;
    if (approvalRequest.payload) {
      try {
        const parsed =
          typeof approvalRequest.payload === "string"
            ? JSON.parse(approvalRequest.payload)
            : approvalRequest.payload;
        executionId = parsed.executionId || null;
        payloadData = parsed;
      } catch {
        payloadData = approvalRequest.payload;
      }
    }

    const payload: ApprovalWebhookPayload = {
      eventId,
      event,
      timestamp: new Date(parseInt(timestamp, 10)).toISOString(),
      organizationId: approvalRequest.organizationId,
      approvalRequestId: approvalRequest.id,
      executionId,
      agentId: approvalRequest.agentId ?? null,
      requestedAction: approvalRequest.requestedAction,
      reason: approvalRequest.reason ?? null,
      status: approvalRequest.status,
      reviewedBy: approvalRequest.reviewedByUserId ?? approvalRequest.reviewedBy ?? null,
      reviewComment: approvalRequest.reviewComment ?? null,
      payload: payloadData
    };

    const rawBody = JSON.stringify(payload);
    const secret = process.env.APPROVAL_WEBHOOK_SECRET || "";
    const signature =
      "sha256=" +
      crypto
        .createHmac("sha256", secret)
        .update(`${timestamp}.${rawBody}`)
        .digest("hex");

    return this.sendWithRetries({
      url: webhookUrl,
      rawBody,
      headers: {
        "Content-Type": "application/json",
        "x-agentready-event-id": eventId,
        "x-agentready-timestamp": timestamp,
        "x-agentready-signature": signature
      },
      approvalRequestId: approvalRequest.id,
      organizationId: approvalRequest.organizationId,
      eventId
    });
  }

  private async sendWithRetries(opts: {
    url: string;
    rawBody: string;
    headers: Record<string, string>;
    approvalRequestId: string;
    organizationId: string;
    eventId: string;
  }): Promise<void> {
    const maxRetries = 3;
    const delays = [1000, 2000, 4000];
    let lastError = "";
    let lastStatusCode: number | null = null;

    for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
      try {
        const controller = new AbortController();
        const timeoutMs = process.env.NODE_ENV === "test" ? 500 : 5000;
        const timer = setTimeout(() => controller.abort(), timeoutMs);

        const res = await fetch(opts.url, {
          method: "POST",
          headers: opts.headers,
          body: opts.rawBody,
          signal: controller.signal
        });
        clearTimeout(timer);

        if (res.ok) {
          return;
        }

        lastStatusCode = res.status;
        lastError = `HTTP ${res.status}: ${res.statusText}`;
      } catch (err: any) {
        lastError = err?.message || String(err);
      }

      if (attempt <= maxRetries) {
        const delayMs = process.env.NODE_ENV === "test" ? 10 : delays[attempt - 1];
        await new Promise((r) => setTimeout(r, delayMs));
      }
    }

    // Retries exhausted: record delivery failure in immutable AuditLog table
    try {
      await this.prisma.auditLog.create({
        data: {
          organizationId: opts.organizationId,
          action: "approval.webhook_delivery_failed",
          actorType: "SYSTEM",
          targetType: "ApprovalRequest",
          targetId: opts.approvalRequestId,
          metadata: {
            url: opts.url,
            attempts: maxRetries + 1,
            error: lastError,
            lastStatusCode,
            eventId: opts.eventId,
            timestamp: new Date().toISOString()
          }
        }
      });
    } catch (auditErr) {
      console.error("[ApprovalWebhookService] Failed to write approval.webhook_delivery_failed audit log:", auditErr);
    }
  }
}
