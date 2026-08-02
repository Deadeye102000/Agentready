export type DashboardData = {
  organization: { id: string; name: string; slug: string } | null;
  metrics: {
    executions: number;
    waitingForApproval: number;
    failedExecutions: number;
    toolCalls: number;
    blockedToolCalls: number;
    pendingApprovals: number;
    evalRuns: number;
    passedEvalRuns: number;
  };
  recentExecutions: Array<{
    id: string;
    status: string;
    objective: string;
    riskScore: number;
    agent: { name: string };
    contract: { name: string; version: number } | null;
    _count: { toolCallTraces: number; evalRuns: number };
  }>;
  recentToolCalls: Array<{
    id: string;
    toolName: string;
    status: string;
    latencyMs: number | null;
    error: string | null;
    agent: { name: string };
  }>;
  recentEvalRuns: Array<{
    id: string;
    name: string;
    status: string;
    score: number | null;
    threshold: number;
  }>;
  approvalGates: Array<{ id: string; capability: string; mode: string; reason: string | null }>;
  featureFlags: Array<{
    id: string;
    capability: string;
    state: string;
    description: string | null;
    agent: { name: string } | null;
  }>;
  mcpServers: Array<{ id: string; name: string; status: string; capabilities: string[] }>;
  pendingApprovalsList: Array<{
    id: string;
    requestedAction: string;
    reason: string;
    status: string;
    agent: { name: string };
    payload: any;
    createdAt: string;
  }>;
};

export type RegressionData = {
  previousScore: number | null;
  currentScore: number | null;
  delta: number | null;
  previousPassRate: number | null;
  currentPassRate: number | null;
  passRateChange: number | null;
  newlyFailing: Array<{ id: string; name: string }>;
  newlyPassing: Array<{ id: string; name: string }>;
};

export type ApiResult<T> = {
  data: T;
  error: string | null;
  isFallback: boolean;
};

export const fallbackDashboard: DashboardData = {
  organization: { id: "demo-org", name: "Acme AI Systems", slug: "acme-ai" },
  metrics: {
    executions: 24,
    waitingForApproval: 2,
    failedExecutions: 3,
    toolCalls: 142,
    blockedToolCalls: 5,
    pendingApprovals: 2,
    evalRuns: 18,
    passedEvalRuns: 15
  },
  recentExecutions: [
    {
      id: "exec-101",
      status: "WAITING_FOR_APPROVAL",
      objective: "Draft onboarding workflow & publish customer docs.",
      riskScore: 78,
      agent: { name: "DocGen Agent" },
      contract: { name: "Customer Onboarding Contract", version: 2 },
      _count: { toolCallTraces: 4, evalRuns: 2 }
    },
    {
      id: "exec-102",
      status: "SUCCEEDED",
      objective: "Sync user directory records with external HR portal.",
      riskScore: 20,
      agent: { name: "DirectorySync Agent" },
      contract: { name: "HR Sync Policy Contract", version: 1 },
      _count: { toolCallTraces: 12, evalRuns: 1 }
    },
    {
      id: "exec-103",
      status: "FAILED",
      objective: "Delete deprecated database snapshot tables.",
      riskScore: 92,
      agent: { name: "Cleanup Agent" },
      contract: { name: "Database Maintenance Contract", version: 1 },
      _count: { toolCallTraces: 1, evalRuns: 0 }
    }
  ],
  recentToolCalls: [
    {
      id: "trace-201",
      toolName: "external.publish",
      status: "BLOCKED",
      latencyMs: 24,
      error: "Approval required by external_publish gate policy.",
      agent: { name: "DocGen Agent" }
    },
    {
      id: "trace-202",
      toolName: "knowledge.search",
      status: "SUCCEEDED",
      latencyMs: 118,
      error: null,
      agent: { name: "DocGen Agent" }
    },
    {
      id: "trace-203",
      toolName: "database.dropTable",
      status: "BLOCKED",
      latencyMs: 12,
      error: "Disabled by tool_execution capability feature flag.",
      agent: { name: "Cleanup Agent" }
    }
  ],
  recentEvalRuns: [
    {
      id: "eval-301",
      name: "Onboarding policy safety eval",
      status: "PASSED",
      score: 0.96,
      threshold: 0.85
    },
    {
      id: "eval-302",
      name: "Database destruction barrier eval",
      status: "FAILED",
      score: 0.50,
      threshold: 0.85
    }
  ],
  approvalGates: [
    {
      id: "gate-401",
      capability: "external.publish",
      mode: "REQUIRE_APPROVAL",
      reason: "Customer-facing deployment must be verified by a human operator."
    },
    {
      id: "gate-402",
      capability: "database.dropTable",
      mode: "BLOCKED",
      reason: "Destructive table operations are strictly prohibited."
    }
  ],
  featureFlags: [
    {
      id: "flag-501",
      capability: "agent_execution",
      state: "ENABLED",
      description: "Global execution runtime permissions.",
      agent: null
    },
    {
      id: "flag-502",
      capability: "tool_execution",
      state: "ENABLED",
      description: "Permission to run integration tools.",
      agent: null
    },
    {
      id: "flag-503",
      capability: "database.dropTable",
      state: "DISABLED",
      description: "Critical safety flag prohibiting destructive DB tool calls.",
      agent: null
    }
  ],
  mcpServers: [
    {
      id: "mcp-601",
      name: "AgentReady Core Gateway",
      status: "ACTIVE",
      capabilities: ["contracts.read", "executions.create", "tool-traces.write"]
    },
    {
      id: "mcp-602",
      name: "Github Integration MCP",
      status: "ACTIVE",
      capabilities: ["repo.read", "pull-request.create"]
    }
  ],
  pendingApprovalsList: [
    {
      id: "approval-701",
      requestedAction: "external.publish",
      reason: "Customer-facing deployment requires human signoff.",
      status: "PENDING",
      agent: { name: "DocGen Agent" },
      payload: { documentId: "doc-99" },
      createdAt: new Date().toISOString()
    }
  ]
};

export const fallbackRegression: RegressionData = {
  previousScore: 0.82,
  currentScore: 0.91,
  delta: 0.09,
  previousPassRate: 0.75,
  currentPassRate: 0.88,
  passRateChange: 0.13,
  newlyFailing: [],
  newlyPassing: [{ id: "case-pass-demo", name: "Verify document publishing gate compliance" }]
};

const getApiBaseUrl = () => {
  if (typeof window !== "undefined") {
    return process.env.NEXT_PUBLIC_AGENTREADY_API_URL || "http://localhost:3001";
  }
  return process.env.AGENTREADY_API_URL || "http://localhost:3001";
};

export async function fetchDashboardData(): Promise<ApiResult<DashboardData>> {
  const apiBaseUrl = getApiBaseUrl();

  try {
    const res = await fetch(`${apiBaseUrl}/api/v1/observability/dashboard`, {
      cache: "no-store",
    });

    if (!res.ok) {
      return {
        data: fallbackDashboard,
        error: `API returned HTTP ${res.status}: ${res.statusText}`,
        isFallback: true,
      };
    }

    const data = (await res.json()) as DashboardData;
    return { data, error: null, isFallback: false };
  } catch (err: any) {
    return {
      data: fallbackDashboard,
      error: err?.message || "Failed to connect to AgentReady API server",
      isFallback: true,
    };
  }
}

export async function fetchRegressionData(): Promise<ApiResult<RegressionData>> {
  const apiBaseUrl = getApiBaseUrl();

  try {
    const res = await fetch(`${apiBaseUrl}/api/v1/eval-runs/regression`, {
      cache: "no-store",
    });

    if (!res.ok) {
      return {
        data: fallbackRegression,
        error: `API returned HTTP ${res.status}: ${res.statusText}`,
        isFallback: true,
      };
    }

    const data = (await res.json()) as RegressionData;
    return { data, error: null, isFallback: false };
  } catch (err: any) {
    return {
      data: fallbackRegression,
      error: err?.message || "Failed to connect to AgentReady API server",
      isFallback: true,
    };
  }
}

export function formatPercent(value: number | null) {
  if (value === null || value === undefined) {
    return "n/a";
  }
  return `${Math.round(value * 100)}%`;
}

function normalizeStatus(status: string) {
  return (status || "").toUpperCase();
}

export function statusClass(status: string) {
  const norm = normalizeStatus(status);
  if (["PASSED", "SUCCEEDED", "ENABLED", "AUTOMATIC", "ACTIVE"].includes(norm)) {
    return "good";
  }

  if (["FAILED", "ERRORED", "BLOCKED", "DISABLED"].includes(norm)) {
    return "bad";
  }

  return "warn";
}

export type ExecutionDetailData = {
  id: string;
  status: string;
  objective: string;
  riskScore: number;
  input: any;
  output: any;
  startedAt: string | null;
  completedAt: string | null;
  failureReason: string | null;
  createdAt: string;
  updatedAt: string;
  agent: { id: string; name: string };
  project: { id: string; name: string } | null;
  contract: { id: string; name: string; version: number } | null;
  task: { id: string; name: string } | null;
  toolCallTraces: Array<{
    id: string;
    toolName: string;
    status: string;
    input: any;
    output: any;
    error: string | null;
    latencyMs: number | null;
    createdAt: string;
    completedAt: string | null;
  }>;
  evalRuns: Array<{
    id: string;
    name: string;
    status: string;
    score: number | null;
    threshold: number;
  }>;
};

export const fallbackExecutionDetail: ExecutionDetailData = {
  id: "demo-execution-detail",
  status: "WAITING_FOR_APPROVAL",
  objective: "Draft onboarding workflow & publish customer docs.",
  riskScore: 78,
  input: { format: "markdown", target: "wiki" },
  output: null,
  startedAt: new Date(Date.now() - 3600000).toISOString(),
  completedAt: null,
  failureReason: null,
  createdAt: new Date(Date.now() - 3600000).toISOString(),
  updatedAt: new Date().toISOString(),
  agent: { id: "agent-1", name: "DocGen Agent" },
  project: { id: "proj-1", name: "Acme Documentation Portal" },
  contract: { id: "contract-1", name: "Customer Onboarding Contract", version: 2 },
  task: null,
  toolCallTraces: [
    {
      id: "trace-1",
      toolName: "knowledge.search",
      status: "SUCCEEDED",
      input: { query: "onboarding process" },
      output: { results: ["onboarding guide template v2", "security access checklist"] },
      error: null,
      latencyMs: 142,
      createdAt: new Date(Date.now() - 3500000).toISOString(),
      completedAt: new Date(Date.now() - 3500000).toISOString()
    },
    {
      id: "trace-2",
      toolName: "external.publish",
      status: "BLOCKED",
      input: { path: "/docs/onboarding", content: "..." },
      output: null,
      error: "Approval required by external_publish gate policy.",
      latencyMs: 18,
      createdAt: new Date(Date.now() - 3400000).toISOString(),
      completedAt: new Date(Date.now() - 3400000).toISOString()
    }
  ],
  evalRuns: []
};

export async function fetchExecutionDetail(id: string): Promise<ApiResult<ExecutionDetailData>> {
  const apiBaseUrl = getApiBaseUrl();

  try {
    const res = await fetch(`${apiBaseUrl}/api/v1/executions/${id}`, {
      cache: "no-store",
    });

    if (!res.ok) {
      return {
        data: fallbackExecutionDetail,
        error: `API returned HTTP ${res.status}: ${res.statusText}`,
        isFallback: true,
      };
    }

    const data = (await res.json()) as ExecutionDetailData;
    return { data, error: null, isFallback: false };
  } catch (err: any) {
    return {
      data: fallbackExecutionDetail,
      error: err?.message || "Failed to connect to AgentReady API server",
      isFallback: true,
    };
  }
}

// ─── Approval Queue ───────────────────────────────────────────────────────────

export type ApprovalRequest = {
  id: string;
  status: string;
  requestedAction: string;
  reason: string | null;
  riskLevel: string | null;
  payload: any;
  note: string | null;
  createdAt: string;
  reviewedAt: string | null;
  executionId: string | null;
  agent: { id: string; name: string } | null;
  reviewedByUser: { id: string; email: string; name: string | null } | null;
};

export const fallbackApprovalRequests: ApprovalRequest[] = [
  {
    id: "approval-demo-1",
    status: "PENDING",
    requestedAction: "external.publish",
    reason: "Action matches approval gate: Customer-facing deployments require human signoff.",
    riskLevel: "HIGH",
    payload: {
      executionId: "demo-execution-detail",
      path: "/docs/onboarding",
      content: "# Onboarding Guide\n\nWelcome to Acme Systems..."
    },
    note: null,
    createdAt: new Date(Date.now() - 1200000).toISOString(),
    reviewedAt: null,
    executionId: "demo-execution-detail",
    agent: { id: "agent-1", name: "DocGen Agent" },
    reviewedByUser: null
  },
  {
    id: "approval-demo-2",
    status: "PENDING",
    requestedAction: "database.schema.alter",
    reason: "Action matches approval gate: Schema migrations require senior engineer review.",
    riskLevel: "CRITICAL",
    payload: {
      executionId: "exec-102",
      table: "users",
      migration: "ALTER TABLE users ADD COLUMN sso_provider VARCHAR(255);"
    },
    note: null,
    createdAt: new Date(Date.now() - 600000).toISOString(),
    reviewedAt: null,
    executionId: "exec-102",
    agent: { id: "agent-2", name: "DB Migration Agent" },
    reviewedByUser: null
  }
];

const getClientApiBaseUrl = () =>
  process.env.NEXT_PUBLIC_AGENTREADY_API_URL || "http://localhost:3001";

export async function fetchApprovalRequests(status?: string): Promise<ApiResult<ApprovalRequest[]>> {
  const base = getClientApiBaseUrl();
  const url = status
    ? `${base}/api/v1/approval-requests?status=${status}`
    : `${base}/api/v1/approval-requests`;

  try {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) {
      return { data: fallbackApprovalRequests, error: `HTTP ${res.status}: ${res.statusText}`, isFallback: true };
    }
    const data = (await res.json()) as ApprovalRequest[];
    return { data, error: null, isFallback: false };
  } catch (err: any) {
    return {
      data: fallbackApprovalRequests,
      error: err?.message || "Failed to connect to AgentReady API server",
      isFallback: true,
    };
  }
}

export async function reviewApprovalRequest(
  id: string,
  status: "APPROVED" | "REJECTED",
  note?: string
): Promise<{ ok: boolean; error: string | null }> {
  const base = getClientApiBaseUrl();
  try {
    const res = await fetch(`${base}/api/v1/approval-requests/${id}/review`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status, note }),
      credentials: "include",
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      return { ok: false, error: (body as any)?.error?.message || `HTTP ${res.status}` };
    }
    return { ok: true, error: null };
  } catch (err: any) {
    return { ok: false, error: err?.message || "Network error" };
  }
}

