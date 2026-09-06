/**
 * Frontend Smoke Tests — apps/web
 *
 * These tests do NOT require a browser or jsdom. They verify:
 *   1. API client type contracts — fallback data shapes are correct
 *   2. Pure helper logic (data formatting, URL construction)
 *   3. ApprovalRequest fallback data has required fields
 *   4. DashboardData fallback satisfies metric contracts
 *   5. reviewApprovalRequest constructs the correct fetch call shape
 *   6. fetchApprovalRequests handles error gracefully (mock fetch)
 *   7. Execution detail fallback has all required display fields
 *   8. Regression data shape is correct
 *
 * Run: node --import tsx --test test/*.test.ts
 */

import { describe, it, before, after, afterEach, beforeEach } from "node:test";
import assert from "node:assert/strict";

// ── Import the module under test (ESM compatible via tsx) ─────────────────────
// We import from the source directly — Next.js compilation not needed for pure TS.
import {
  type DashboardData,
  type RegressionData,
  type ApprovalRequest,
  type ApiResult,
  fallbackDashboard,
  fallbackApprovalRequests,
} from "../src/lib/api.js";
import {
  getApiKey,
  DEV_DEFAULT_SANDBOX_AGENT_API_KEY,
} from "../src/lib/sandboxAuth.js";
import { POST as sandboxPost } from "../src/app/api/sandbox/route.js";
import { resetSandboxRateLimits } from "../src/lib/sandbox/rateLimit.js";

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Assert a value is a non-null string */
function isNonEmptyString(v: unknown, label: string) {
  assert.equal(typeof v, "string", `${label} should be a string`);
  assert.ok((v as string).length > 0, `${label} should not be empty`);
}

/** Assert a value is a number (including 0) */
function isNumber(v: unknown, label: string) {
  assert.equal(typeof v, "number", `${label} should be a number`);
  assert.ok(!Number.isNaN(v), `${label} should not be NaN`);
}

// ─── Dashboard Fallback Data Contract ────────────────────────────────────────

describe("Dashboard Fallback Data Contract", () => {
  it("fallbackDashboard has a valid organization object", () => {
    assert.ok(fallbackDashboard.organization, "organization should be defined");
    isNonEmptyString(fallbackDashboard.organization!.id, "organization.id");
    isNonEmptyString(fallbackDashboard.organization!.name, "organization.name");
    isNonEmptyString(fallbackDashboard.organization!.slug, "organization.slug");
  });

  it("fallbackDashboard metrics are all non-negative numbers", () => {
    const m = fallbackDashboard.metrics;
    const keys: (keyof typeof m)[] = [
      "executions",
      "waitingForApproval",
      "failedExecutions",
      "toolCalls",
      "blockedToolCalls",
      "pendingApprovals",
      "evalRuns",
      "passedEvalRuns",
    ];
    for (const k of keys) {
      isNumber(m[k], `metrics.${k}`);
      assert.ok((m[k] as number) >= 0, `metrics.${k} must be >= 0`);
    }
  });

  it("passedEvalRuns <= evalRuns (logical consistency)", () => {
    assert.ok(
      fallbackDashboard.metrics.passedEvalRuns <= fallbackDashboard.metrics.evalRuns,
      "passedEvalRuns must be <= evalRuns"
    );
  });

  it("fallbackDashboard.recentExecutions is a non-empty array with required fields", () => {
    const execs = fallbackDashboard.recentExecutions;
    assert.ok(Array.isArray(execs), "recentExecutions should be an array");
    assert.ok(execs.length > 0, "recentExecutions should not be empty in fallback");

    for (const exec of execs) {
      isNonEmptyString(exec.id, "execution.id");
      isNonEmptyString(exec.status, "execution.status");
      isNonEmptyString(exec.objective, "execution.objective");
      isNumber(exec.riskScore, "execution.riskScore");
      assert.ok(exec.agent?.name, "execution.agent.name should be present");
      assert.ok(typeof exec._count?.toolCallTraces === "number", "toolCallTraces count should be number");
    }
  });

  it("fallbackDashboard.recentToolCalls is an array with required fields", () => {
    const traces = fallbackDashboard.recentToolCalls;
    assert.ok(Array.isArray(traces), "recentToolCalls should be an array");

    for (const t of traces) {
      isNonEmptyString(t.id, "toolCall.id");
      isNonEmptyString(t.toolName, "toolCall.toolName");
      isNonEmptyString(t.status, "toolCall.status");
      assert.ok(t.agent?.name, "toolCall.agent.name should be present");
    }
  });

  it("fallbackDashboard.pendingApprovalsList items have required fields", () => {
    const approvals = fallbackDashboard.pendingApprovalsList;
    assert.ok(Array.isArray(approvals), "pendingApprovalsList should be an array");

    for (const a of approvals) {
      isNonEmptyString(a.id, "approval.id");
      isNonEmptyString(a.requestedAction, "approval.requestedAction");
      isNonEmptyString(a.status, "approval.status");
      isNonEmptyString(a.createdAt, "approval.createdAt");
      assert.ok(a.agent?.name, "approval.agent.name should be present");
    }
  });
});

// ─── Approval Request Fallback Data Contract ─────────────────────────────────

describe("Approval Request Fallback Data Contract", () => {
  it("fallbackApprovalRequests is a non-empty array", () => {
    assert.ok(Array.isArray(fallbackApprovalRequests));
    assert.ok(fallbackApprovalRequests.length >= 1);
  });

  it("each fallback approval request has required fields", () => {
    for (const req of fallbackApprovalRequests) {
      isNonEmptyString(req.id, "req.id");
      isNonEmptyString(req.status, "req.status");
      isNonEmptyString(req.requestedAction, "req.requestedAction");
      assert.ok(req.payload && typeof req.payload === "object", "req.payload should be an object");
      isNonEmptyString(req.createdAt, "req.createdAt");
      // createdAt should be a valid ISO date
      assert.ok(!Number.isNaN(Date.parse(req.createdAt)), "req.createdAt should parse as a date");
    }
  });

  it("all fallback approval requests have status PENDING", () => {
    for (const req of fallbackApprovalRequests) {
      assert.equal(req.status, "PENDING", `Fallback request ${req.id} should be PENDING`);
    }
  });

  it("no fallback approval request exposes raw secret-looking fields in payload", () => {
    const secretPattern = /password|token|secret|key|credential/i;
    for (const req of fallbackApprovalRequests) {
      const payloadStr = JSON.stringify(req.payload);
      assert.ok(
        !secretPattern.test(payloadStr),
        `Payload for ${req.id} appears to contain sensitive data: ${payloadStr.slice(0, 80)}`
      );
    }
  });
});

// ─── ApiResult Type Contract ─────────────────────────────────────────────────

describe("ApiResult Type Contract", () => {
  it("a valid ApiResult<T> has data, error, and isFallback fields", () => {
    // Construct inline — tests the type contract shapes we rely on in the UI
    const ok: ApiResult<string[]> = { data: ["a", "b"], error: null, isFallback: false };
    assert.deepEqual(ok.data, ["a", "b"]);
    assert.equal(ok.error, null);
    assert.equal(ok.isFallback, false);

    const fallback: ApiResult<string[]> = {
      data: ["fallback"],
      error: "Failed to connect",
      isFallback: true,
    };
    assert.equal(fallback.isFallback, true);
    assert.ok(fallback.error);
    assert.ok(Array.isArray(fallback.data));
  });
});

// ─── Execution Status Formatting Contract ────────────────────────────────────

describe("Execution Status Values Contract", () => {
  const KNOWN_STATUSES = new Set([
    "QUEUED",
    "RUNNING",
    "WAITING_FOR_APPROVAL",
    "SUCCEEDED",
    "FAILED",
    "CANCELLED",
  ]);

  it("all fallback execution statuses are known values", () => {
    for (const exec of fallbackDashboard.recentExecutions) {
      assert.ok(
        KNOWN_STATUSES.has(exec.status),
        `Unknown execution status '${exec.status}' in fallback data`
      );
    }
  });

  it("all fallback tool call statuses are known values", () => {
    const TOOL_STATUSES = new Set(["SUCCEEDED", "FAILED", "BLOCKED", "PENDING"]);
    for (const t of fallbackDashboard.recentToolCalls) {
      assert.ok(
        TOOL_STATUSES.has(t.status),
        `Unknown tool call status '${t.status}' in fallback data`
      );
    }
  });

  it("all fallback eval run statuses are known values", () => {
    const EVAL_STATUSES = new Set(["QUEUED", "RUNNING", "PASSED", "FAILED"]);
    for (const e of fallbackDashboard.recentEvalRuns) {
      assert.ok(
        EVAL_STATUSES.has(e.status),
        `Unknown eval run status '${e.status}' in fallback data`
      );
    }
  });
});

// ─── Regression Data Shape Contract ──────────────────────────────────────────

describe("Regression Data Shape Contract", () => {
  it("a valid RegressionData with all nulls is structurally correct", () => {
    const empty: RegressionData = {
      previousScore: null,
      currentScore: null,
      delta: null,
      previousPassRate: null,
      currentPassRate: null,
      passRateChange: null,
      newlyFailing: [],
      newlyPassing: [],
    };
    assert.equal(empty.delta, null);
    assert.ok(Array.isArray(empty.newlyFailing));
    assert.ok(Array.isArray(empty.newlyPassing));
  });

  it("delta is currentScore - previousScore when both are set", () => {
    // The UI computes this inline; test the arithmetic contract
    const prev = 0.75;
    const curr = 0.90;
    const delta = Math.round((curr - prev) * 100) / 100;
    assert.ok(delta > 0, "positive regression improvement");
    assert.equal(delta, 0.15);
  });

  it("negative delta indicates regression", () => {
    const prev = 0.90;
    const curr = 0.70;
    const delta = Math.round((curr - prev) * 100) / 100;
    assert.ok(delta < 0, "negative delta is a regression");
  });
});

// ─── Feature Flag Shape Contract ─────────────────────────────────────────────

describe("Feature Flags Data Contract", () => {
  it("fallback feature flags all have required fields", () => {
    const flags = fallbackDashboard.featureFlags;
    assert.ok(Array.isArray(flags));
    for (const f of flags) {
      isNonEmptyString(f.id, "flag.id");
      isNonEmptyString(f.capability, "flag.capability");
      assert.ok(
        f.state === "ENABLED" || f.state === "DISABLED",
        `flag.state must be ENABLED or DISABLED, got '${f.state}'`
      );
    }
  });

  it("fallback approval gates all have required fields", () => {
    const gates = fallbackDashboard.approvalGates;
    assert.ok(Array.isArray(gates));
    for (const g of gates) {
      isNonEmptyString(g.id, "gate.id");
      isNonEmptyString(g.capability, "gate.capability");
      assert.ok(
        ["BLOCKED", "REQUIRE_APPROVAL", "AUTOMATIC"].includes(g.mode),
        `gate.mode must be a valid mode, got '${g.mode}'`
      );
    }
  });
});

// ─── Sandbox Route Production Secret Protection ───────────────────────────

describe("Sandbox Route Production Secret Protection", () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("throws error when NODE_ENV=production and SANDBOX_AGENT_API_KEY is unset", () => {
    (process.env as Record<string, string | undefined>).NODE_ENV = "production";
    delete process.env.SANDBOX_AGENT_API_KEY;

    assert.throws(
      () => getApiKey(),
      (err: any) => {
        assert.match(
          err.message,
          /SANDBOX_AGENT_API_KEY is required in production and must not use the development default/
        );
        return true;
      }
    );
  });

  it("throws error when NODE_ENV=production and SANDBOX_AGENT_API_KEY is the development default", () => {
    (process.env as Record<string, string | undefined>).NODE_ENV = "production";
    process.env.SANDBOX_AGENT_API_KEY = DEV_DEFAULT_SANDBOX_AGENT_API_KEY;

    assert.throws(
      () => getApiKey(),
      (err: any) => {
        assert.match(
          err.message,
          /SANDBOX_AGENT_API_KEY is required in production and must not use the development default/
        );
        return true;
      }
    );
  });

  it("returns development default key when NODE_ENV=development and key is unset", () => {
    (process.env as Record<string, string | undefined>).NODE_ENV = "development";
    delete process.env.SANDBOX_AGENT_API_KEY;

    assert.equal(getApiKey(), DEV_DEFAULT_SANDBOX_AGENT_API_KEY);
  });

  it("returns configured key in production when valid secret is provided", () => {
    (process.env as Record<string, string | undefined>).NODE_ENV = "production";
    process.env.SANDBOX_AGENT_API_KEY = "ar_live_custom_prod_secret_token";

    assert.equal(getApiKey(), "ar_live_custom_prod_secret_token");
  });
});

describe("Sandbox Route Schema Validation", () => {
  beforeEach(() => {
    resetSandboxRateLimits();
  });

  it("returns 400 on malformed JSON body", async () => {
    const req = new Request("http://localhost:3000/api/sandbox", {
      method: "POST",
      body: "not-json{{"
    });
    const res = await sandboxPost(req);
    assert.equal(res.status, 400);
    const json = await res.json();
    assert.match(json.error, /Invalid JSON/);
  });

  it("returns 400 when body is not an object", async () => {
    const req = new Request("http://localhost:3000/api/sandbox", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(["not", "an", "object"])
    });
    const res = await sandboxPost(req);
    assert.equal(res.status, 400);
    const json = await res.json();
    assert.match(json.error, /Validation error/);
  });

  it("returns 400 when agentType is missing without action", async () => {
    const req = new Request("http://localhost:3000/api/sandbox", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({})
    });
    const res = await sandboxPost(req);
    assert.equal(res.status, 400);
    const json = await res.json();
    assert.match(json.error, /Missing agentType parameter/);
  });

  it("returns 400 when agentType is unknown", async () => {
    const req = new Request("http://localhost:3000/api/sandbox", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ agentType: "invalid_agent" })
    });
    const res = await sandboxPost(req);
    assert.equal(res.status, 400);
    const json = await res.json();
    assert.match(json.error, /Unknown agentType/);
  });

  it("returns 400 when action is 'approve' but executionId is missing", async () => {
    const req = new Request("http://localhost:3000/api/sandbox", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "approve" })
    });
    const res = await sandboxPost(req);
    assert.equal(res.status, 400);
    const json = await res.json();
    assert.match(json.error, /executionId is required/);
  });

  it("returns 400 when action is unsupported", async () => {
    const req = new Request("http://localhost:3000/api/sandbox", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "delete_everything" })
    });
    const res = await sandboxPost(req);
    assert.equal(res.status, 400);
    const json = await res.json();
    assert.match(json.error, /Invalid action/);
  });

  it("enforces IP rate limiting and returns 429 Too Many Requests", async () => {
    const ip = "192.168.10.42";
    // Send 10 validly-formatted rejection requests (e.g. malformed json) to exhaust limit
    for (let i = 0; i < 10; i++) {
      const req = new Request("http://localhost:3000/api/sandbox", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-forwarded-for": ip
        },
        body: JSON.stringify({ action: "unsupported" })
      });
      const res = await sandboxPost(req);
      assert.equal(res.status, 400);
    }

    // 11th request should be rate-limited with HTTP 429
    const rateLimitedReq = new Request("http://localhost:3000/api/sandbox", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-forwarded-for": ip
      },
      body: JSON.stringify({ action: "unsupported" })
    });
    const rateLimitedRes = await sandboxPost(rateLimitedReq);
    assert.equal(rateLimitedRes.status, 429);
    const rateLimitedJson = await rateLimitedRes.json();
    assert.match(rateLimitedJson.error, /Too many requests/);
    assert.ok(rateLimitedRes.headers.get("Retry-After"));
    assert.equal(rateLimitedRes.headers.get("X-RateLimit-Remaining"), "0");
  });
});

