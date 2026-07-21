type DashboardData = {
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
};

const fallbackDashboard: DashboardData = {
  organization: { id: "demo-org", name: "Demo Organization", slug: "demo-org" },
  metrics: {
    executions: 1,
    waitingForApproval: 1,
    failedExecutions: 0,
    toolCalls: 2,
    blockedToolCalls: 1,
    pendingApprovals: 1,
    evalRuns: 1,
    passedEvalRuns: 1
  },
  recentExecutions: [
    {
      id: "demo-agent-execution",
      status: "WAITING_FOR_APPROVAL",
      objective: "Draft onboarding notes without publishing customer-facing changes.",
      riskScore: 64,
      agent: { name: "Demo Agent" },
      contract: { name: "Safe onboarding draft", version: 1 },
      _count: { toolCallTraces: 2, evalRuns: 1 }
    }
  ],
  recentToolCalls: [
    {
      id: "demo-tool-call-publish",
      toolName: "external.publish",
      status: "BLOCKED",
      latencyMs: 18,
      error: "Approval required by external_publish gate.",
      agent: { name: "Demo Agent" }
    },
    {
      id: "demo-tool-call-knowledge",
      toolName: "knowledge.search",
      status: "SUCCEEDED",
      latencyMs: 142,
      error: null,
      agent: { name: "Demo Agent" }
    }
  ],
  recentEvalRuns: [
    {
      id: "demo-eval-run",
      name: "Contract compliance smoke eval",
      status: "PASSED",
      score: 0.91,
      threshold: 0.85
    }
  ],
  approvalGates: [
    {
      id: "demo-gate",
      capability: "external_publish",
      mode: "REQUIRE_APPROVAL",
      reason: "Customer-visible publishing must remain human-reviewed."
    }
  ],
  featureFlags: [
    {
      id: "demo-flag-search",
      capability: "knowledge.search",
      state: "ENABLED",
      description: "Allow the demo agent to search approved knowledge documents.",
      agent: { name: "Demo Agent" }
    },
    {
      id: "demo-flag-publish",
      capability: "external.publish",
      state: "DISABLED",
      description: "Publishing is intentionally disabled until the MCP-era policy path is ready.",
      agent: { name: "Demo Agent" }
    }
  ],
  mcpServers: [
    {
      id: "demo-mcp",
      name: "AgentReady MCP Gateway",
      status: "PLANNED",
      capabilities: ["contracts.read", "executions.create", "tool-traces.write"]
    }
  ]
};

async function getDashboard(): Promise<DashboardData> {
  const apiBaseUrl = process.env.AGENTREADY_API_URL ?? "http://localhost:4000";

  try {
    const response = await fetch(`${apiBaseUrl}/api/v1/observability/dashboard?organizationId=demo-org`, {
      cache: "no-store"
    });

    if (!response.ok) {
      return fallbackDashboard;
    }

    return (await response.json()) as DashboardData;
  } catch {
    return fallbackDashboard;
  }
}

function formatPercent(value: number | null) {
  if (value === null) {
    return "n/a";
  }

  return `${Math.round(value * 100)}%`;
}

function statusClass(status: string) {
  if (["PASSED", "SUCCEEDED", "ENABLED", "AUTOMATIC", "ACTIVE"].includes(status)) {
    return "good";
  }

  if (["FAILED", "ERRORED", "BLOCKED", "DISABLED"].includes(status)) {
    return "bad";
  }

  return "warn";
}

export default async function HomePage() {
  const dashboard = await getDashboard();
  const evalPassRate =
    dashboard.metrics.evalRuns === 0 ? 0 : dashboard.metrics.passedEvalRuns / dashboard.metrics.evalRuns;

  return (
    <main className="shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">AgentReady</p>
          <h1>Agent observability dashboard</h1>
        </div>
        <div className="orgBadge">{dashboard.organization?.name ?? "No organization"}</div>
      </header>

      <section className="metricGrid" aria-label="Harness metrics">
        <div className="metric">
          <span>Executions</span>
          <strong>{dashboard.metrics.executions}</strong>
        </div>
        <div className="metric">
          <span>Awaiting approval</span>
          <strong>{dashboard.metrics.waitingForApproval}</strong>
        </div>
        <div className="metric">
          <span>Tool calls</span>
          <strong>{dashboard.metrics.toolCalls}</strong>
        </div>
        <div className="metric">
          <span>Eval pass rate</span>
          <strong>{formatPercent(evalPassRate)}</strong>
        </div>
      </section>

      <section className="workspace">
        <div className="panel wide">
          <div className="panelHeader">
            <h2>Execution harness</h2>
            <span>{dashboard.metrics.failedExecutions} failed</span>
          </div>
          <div className="executionList">
            {dashboard.recentExecutions.map((execution) => (
              <article className="execution" key={execution.id}>
                <div>
                  <div className="rowTitle">{execution.objective}</div>
                  <div className="muted">
                    {execution.agent.name} · {execution.contract?.name ?? "No contract"} v
                    {execution.contract?.version ?? 0}
                  </div>
                </div>
                <div className="executionStats">
                  <span className={`pill ${statusClass(execution.status)}`}>{execution.status}</span>
                  <span>{execution._count.toolCallTraces} traces</span>
                  <span>{execution._count.evalRuns} evals</span>
                  <span>Risk {execution.riskScore}</span>
                </div>
              </article>
            ))}
          </div>
        </div>

        <div className="panel">
          <div className="panelHeader">
            <h2>Approval gates</h2>
            <span>{dashboard.metrics.pendingApprovals} pending</span>
          </div>
          <div className="stack">
            {dashboard.approvalGates.map((gate) => (
              <div className="compactRow" key={gate.id}>
                <div>
                  <strong>{gate.capability}</strong>
                  <span>{gate.reason}</span>
                </div>
                <span className={`pill ${statusClass(gate.mode)}`}>{gate.mode}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="panel">
          <div className="panelHeader">
            <h2>Tool-call tracing</h2>
            <span>{dashboard.metrics.blockedToolCalls} blocked</span>
          </div>
          <div className="stack">
            {dashboard.recentToolCalls.map((trace) => (
              <div className="compactRow" key={trace.id}>
                <div>
                  <strong>{trace.toolName}</strong>
                  <span>{trace.error ?? `${trace.agent.name} · ${trace.latencyMs ?? 0}ms`}</span>
                </div>
                <span className={`pill ${statusClass(trace.status)}`}>{trace.status}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="panel">
          <div className="panelHeader">
            <h2>Eval runs</h2>
            <span>{dashboard.metrics.evalRuns} total</span>
          </div>
          <div className="stack">
            {dashboard.recentEvalRuns.map((evalRun) => (
              <div className="compactRow" key={evalRun.id}>
                <div>
                  <strong>{evalRun.name}</strong>
                  <span>
                    Score {formatPercent(evalRun.score)} · threshold {formatPercent(evalRun.threshold)}
                  </span>
                </div>
                <span className={`pill ${statusClass(evalRun.status)}`}>{evalRun.status}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="panel">
          <div className="panelHeader">
            <h2>Capability flags</h2>
            <span>{dashboard.featureFlags.length} flags</span>
          </div>
          <div className="stack">
            {dashboard.featureFlags.map((flag) => (
              <div className="compactRow" key={flag.id}>
                <div>
                  <strong>{flag.capability}</strong>
                  <span>{flag.agent?.name ?? "Organization-wide"}</span>
                </div>
                <span className={`pill ${statusClass(flag.state)}`}>{flag.state}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="panel wide">
          <div className="panelHeader">
            <h2>Future MCP server support</h2>
            <span>{dashboard.mcpServers.length} registration</span>
          </div>
          <div className="mcpGrid">
            {dashboard.mcpServers.map((server) => (
              <div className="mcpRow" key={server.id}>
                <div>
                  <strong>{server.name}</strong>
                  <span>{server.capabilities.join(", ")}</span>
                </div>
                <span className={`pill ${statusClass(server.status)}`}>{server.status}</span>
              </div>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}
