import Link from "next/link";
import { cookies } from "next/headers";
import { Navbar } from "../components/Navbar";
import { SandboxController } from "../components/SandboxController";
import { LandingView } from "../components/LandingView";
import {
  fetchDashboardData,
  fetchRegressionData,
  formatPercent,
  statusClass
} from "../lib/api";

function EmptyState({ title, message }: { title: string; message: string }) {
  return (
    <div className="emptyState">
      <div className="emptyIcon">✦</div>
      <div className="emptyTitle">{title}</div>
      <div className="emptyMessage">{message}</div>
    </div>
  );
}

function ErrorAlert({ message, isFallback }: { message: string; isFallback: boolean }) {
  if (!isFallback || !message) return null;
  return (
    <div className="errorBanner" role="alert">
      <div className="errorContent">
        <div className="errorIcon">!</div>
        <div className="errorText">
          <strong>API Connection Alert</strong>
          <span>{message} — Showing cached fallback representation.</span>
        </div>
      </div>
    </div>
  );
}

export default async function HomePage() {
  const cookieStore = await cookies();
  const sessionToken = cookieStore.get("agentready_session")?.value;

  // Unauthenticated visitors to the root URL see the public landing page
  if (!sessionToken) {
    return <LandingView isAuthenticated={false} />;
  }

  const cookieHeader = cookieStore.toString();

  const [dashboardRes, regressionRes] = await Promise.all([
    fetchDashboardData(cookieHeader),
    fetchRegressionData(cookieHeader)
  ]);

  // If session is expired or invalid (401 Unauthorized), show landing page
  if (dashboardRes.error && (dashboardRes.error.includes("401") || dashboardRes.error.includes("Unauthorized"))) {
    return <LandingView isAuthenticated={false} />;
  }

  const dashboard = dashboardRes.data;

  // Explicit error state if the backend is disconnected or returns an error — never silent mock fallback
  if (dashboardRes.error || !dashboard) {
    return (
      <>
        <Navbar orgName="AgentReady Control Plane" />
        <main className="shell">
          <div
            className="panel wide"
            style={{ borderLeft: "5px solid #ef4444", padding: "32px", marginTop: "24px" }}
            role="alert"
          >
            <div style={{ display: "flex", gap: "16px", alignItems: "flex-start" }}>
              <div style={{ fontSize: "2rem", lineHeight: 1 }}>⚠️</div>
              <div style={{ flex: 1 }}>
                <span className="pill bad" style={{ marginBottom: "8px", display: "inline-block" }}>
                  Backend Disconnected
                </span>
                <h1 style={{ fontSize: "1.5rem", fontWeight: "700", margin: "8px 0" }}>
                  Unable to connect to AgentReady API Server
                </h1>
                <p style={{ color: "#475569", margin: "8px 0 16px 0", fontSize: "0.95rem", lineHeight: 1.5 }}>
                  {dashboardRes.error ||
                    "The control plane API server is unreachable. Live monitoring data, telemetry, and contract metrics cannot be displayed."}
                </p>
                <div
                  style={{
                    background: "rgba(0, 0, 0, 0.04)",
                    padding: "12px 16px",
                    borderRadius: "6px",
                    fontFamily: "monospace",
                    fontSize: "0.85rem",
                    marginBottom: "20px"
                  }}
                >
                  Target Endpoint:{" "}
                  <strong>
                    {process.env.AGENTREADY_API_URL ||
                      process.env.NEXT_PUBLIC_AGENTREADY_API_URL ||
                      "http://localhost:3001"}
                  </strong>
                </div>
                <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
                  <Link href="/" className="retryBtn" style={{ textDecoration: "none" }}>
                    ↻ Retry Connection
                  </Link>
                  <span style={{ fontSize: "0.85rem", color: "#64748b" }}>
                    Ensure the Fastify API process is running on port 3001.
                  </span>
                </div>
              </div>
            </div>
          </div>

          <div style={{ marginTop: "24px" }}>
            <SandboxController />
          </div>
        </main>
      </>
    );
  }

  const regression = regressionRes.data || {
    previousScore: null,
    currentScore: null,
    delta: null,
    previousPassRate: null,
    currentPassRate: null,
    passRateChange: null,
    newlyFailing: [],
    newlyPassing: []
  };

  // Metric Computations for 4 Primary Overview KPI Cards
  const totalExecutions = dashboard.metrics.executions;
  const failedExecutions = dashboard.metrics.failedExecutions;
  const succeededExecutions = Math.max(
    0,
    totalExecutions - failedExecutions - dashboard.metrics.waitingForApproval
  );
  const successRate = totalExecutions === 0 ? null : succeededExecutions / totalExecutions;
  const pendingApprovals = dashboard.metrics.pendingApprovals;
  const evalPassRate =
    dashboard.metrics.evalRuns === 0
      ? null
      : dashboard.metrics.passedEvalRuns / dashboard.metrics.evalRuns;
  const disabledCriticalFlags = dashboard.featureFlags.filter((f) => f.state === "DISABLED").length;
  const registeredMcpServers = dashboard.mcpServers.length;

  return (
    <>
      <Navbar orgName={dashboard.organization?.name} />
      <main className="shell">
        <ErrorAlert
          message={dashboardRes.error || regressionRes.error || ""}
          isFallback={dashboardRes.isFallback || regressionRes.isFallback}
        />

        <section className="hero" style={{ marginBottom: "20px" }}>
          <div className="heroTag">Control Plane Overview</div>
          <h1 className="heroTitle">Agent Governance & Compliance Telemetry</h1>
          <p className="heroSub">
            Continuous runtime guardrails, human authorization checkpoints, and immutable audit ledgers for autonomous AI agents.
          </p>
        </section>

        {/* 4 Primary Overview Dashboard KPI Cards */}
        <section className="metricGrid" aria-label="Primary Governance KPI Metrics">
          <Link href="/executions" className="metricCard">
            <div className="metricHeader">
              <span className="metricLabel">Total Executions</span>
              <span className="pill">ALL RUNS</span>
            </div>
            <div className="metricValue">{totalExecutions}</div>
            <div className="metricSubtext">Lifetime agent execution runs</div>
          </Link>

          <div className="metricCard">
            <div className="metricHeader">
              <span className="metricLabel">Success Rate</span>
              <span className={`pill ${successRate !== null && successRate >= 0.8 ? "good" : "warn"}`}>
                {successRate !== null && successRate >= 0.8 ? "OPTIMAL" : "ATTENTION"}
              </span>
            </div>
            <div className="metricValue">{formatPercent(successRate)}</div>
            <div className="metricSubtext">{succeededExecutions} completed runs without blocks</div>
          </div>

          <Link href="/approval-queue" className="metricCard">
            <div className="metricHeader">
              <span className="metricLabel">Pending Approvals</span>
              <span className={`pill ${pendingApprovals > 0 ? "warn" : "good"}`}>
                {pendingApprovals > 0 ? "ACTION REQ" : "CLEARED"}
              </span>
            </div>
            <div className="metricValue" style={{ color: pendingApprovals > 0 ? "#b45309" : undefined }}>
              {pendingApprovals}
            </div>
            <div className="metricSubtext">
              {pendingApprovals > 0 ? "Awaiting human operator review" : "No blocked actions in queue"}
            </div>
          </Link>

          <Link href="/evals" className="metricCard">
            <div className="metricHeader">
              <span className="metricLabel">Eval Compliance</span>
              <span className={`pill ${evalPassRate !== null && evalPassRate >= 0.8 ? "good" : "warn"}`}>
                {evalPassRate !== null && evalPassRate >= 0.8 ? "COMPLIANT" : "REGRESSED"}
              </span>
            </div>
            <div className="metricValue">{formatPercent(evalPassRate)}</div>
            <div className="metricSubtext">
              {dashboard.metrics.passedEvalRuns} of {dashboard.metrics.evalRuns} eval suites passed
            </div>
          </Link>
        </section>

        {/* System Health Ribbon */}
        <section className="healthRibbon" aria-label="System Connectivity & Guardrail Health">
          <div className="healthRibbonGroup">
            <Link href="/mcp" className="healthRibbonItem" title="View Model Context Protocol servers">
              <span className="healthDot"></span>
              <span>
                <strong>{registeredMcpServers}</strong> MCP Server{registeredMcpServers === 1 ? "" : "s"} Online
              </span>
            </Link>

            <Link href="/approval-queue" className="healthRibbonItem" title="View active capability approval gates">
              <span className="healthDot"></span>
              <span>
                <strong>{dashboard.approvalGates.length}</strong> Approval Gates Active
              </span>
            </Link>

            <Link href="/feature-flags" className="healthRibbonItem" title="View capability feature flags">
              <span className={`healthDot ${disabledCriticalFlags > 0 ? "warn" : ""}`}></span>
              <span>
                <strong>{dashboard.featureFlags.length}</strong> Feature Flags ({disabledCriticalFlags} Guarded)
              </span>
            </Link>

            <Link href="/traces" className="healthRibbonItem" title="View tool-call traces">
              <span className="healthDot"></span>
              <span>
                <strong>{dashboard.metrics.toolCalls}</strong> Tool Traces ({dashboard.metrics.blockedToolCalls} Blocked)
              </span>
            </Link>
          </div>

          <div style={{ fontSize: "0.8rem", color: "#64748b" }}>
            Deterministic Continuous Evaluation Active
          </div>
        </section>

        {/* Interactive Testing & Simulation Sandbox (Collapsible) */}
        <SandboxController defaultExpanded={false} />

        {/* Dashboard Two-Column Workspace */}
        <section className="workspace">
          {/* Column 1: Pending Approvals & Recent Executions */}
          <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
            {/* Pending Approvals Panel */}
            <div className="panel">
              <div className="panelHeader">
                <div>
                  <h2>Pending approvals</h2>
                  <span>{dashboard.pendingApprovalsList.length} request(s) awaiting review</span>
                </div>
                <Link href="/approval-queue" className="viewAllLink">
                  Open Queue →
                </Link>
              </div>
              {dashboard.pendingApprovalsList.length > 0 ? (
                <div className="stack">
                  {dashboard.pendingApprovalsList.map((request) => (
                    <Link
                      href="/approval-queue"
                      key={request.id}
                      className="compactRow"
                      style={{ textDecoration: "none", color: "inherit" }}
                    >
                      <div>
                        <strong>{request.requestedAction}</strong>
                        <span className="muted">
                          {request.agent.name} · {request.reason}
                        </span>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                        <span className="pill warn">{request.status}</span>
                        <span className="viewAllLink" style={{ fontSize: "0.78rem" }}>Review →</span>
                      </div>
                    </Link>
                  ))}
                </div>
              ) : (
                <EmptyState
                  title="Zero Pending Approvals"
                  message="All clear! No autonomous agent actions are currently blocked awaiting human review."
                />
              )}
            </div>

            {/* Recent Executions Panel */}
            <div className="panel">
              <div className="panelHeader">
                <div>
                  <h2>Recent executions</h2>
                  <span>{totalExecutions} total run(s)</span>
                </div>
                <Link href="/executions" className="viewAllLink">
                  View All ({totalExecutions}) →
                </Link>
              </div>
              {dashboard.recentExecutions.length > 0 ? (
                <div className="executionList">
                  {dashboard.recentExecutions.slice(0, 5).map((execution) => (
                    <Link
                      href={`/executions/${execution.id}`}
                      key={execution.id}
                      style={{ textDecoration: "none", color: "inherit", display: "block" }}
                    >
                      <article className="execution">
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
                          <span className="pill" style={{ fontSize: "0.72rem" }}>Risk {execution.riskScore}</span>
                        </div>
                      </article>
                    </Link>
                  ))}
                </div>
              ) : (
                <EmptyState
                  title="No Executions Recorded"
                  message="Create a task contract and trigger an agent run to begin observing executions."
                />
              )}
            </div>
          </div>

          {/* Column 2: Evaluation Regression & Security Guardrails */}
          <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
            {/* Evaluation Regression Card */}
            <div className="panel">
              <div className="panelHeader">
                <div>
                  <h2>Evaluation regression</h2>
                  <span>Historical contract assertion delta</span>
                </div>
                <Link href="/evals" className="viewAllLink">
                  Open Evals →
                </Link>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem", marginTop: "1rem" }}>
                <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem", alignItems: "flex-start" }}>
                  <span className="muted">Score comparison</span>
                  <strong style={{ fontSize: "1.5rem" }}>
                    {formatPercent(regression.currentScore)}
                    {regression.delta !== null && (
                      <span
                        style={{
                          fontSize: "0.875rem",
                          marginLeft: "0.5rem",
                          color: regression.delta >= 0 ? "#10b981" : "#ef4444"
                        }}
                      >
                        {regression.delta >= 0 ? "+" : ""}
                        {formatPercent(regression.delta)}
                      </span>
                    )}
                  </strong>
                  <span className="muted" style={{ fontSize: "0.82rem" }}>
                    Previous: {formatPercent(regression.previousScore)}
                  </span>
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem", alignItems: "flex-start" }}>
                  <span className="muted">Pass rate change</span>
                  <strong style={{ fontSize: "1.5rem" }}>
                    {formatPercent(regression.currentPassRate)}
                    {regression.passRateChange !== null && (
                      <span
                        style={{
                          fontSize: "0.875rem",
                          marginLeft: "0.5rem",
                          color: regression.passRateChange >= 0 ? "#10b981" : "#ef4444"
                        }}
                      >
                        {regression.passRateChange >= 0 ? "+" : ""}
                        {formatPercent(regression.passRateChange)}
                      </span>
                    )}
                  </strong>
                  <span className="muted" style={{ fontSize: "0.82rem" }}>
                    Previous: {formatPercent(regression.previousPassRate)}
                  </span>
                </div>
              </div>

              <div style={{ marginTop: "1.25rem", display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
                <div>
                  <h3
                    style={{
                      fontSize: "0.85rem",
                      fontWeight: "bold",
                      marginBottom: "0.5rem",
                      display: "flex",
                      alignItems: "center",
                      gap: "0.35rem"
                    }}
                  >
                    <span
                      style={{
                        display: "inline-block",
                        width: "8px",
                        height: "8px",
                        borderRadius: "50%",
                        backgroundColor: "#10b981"
                      }}
                    ></span>
                    Newly passing ({regression.newlyPassing.length})
                  </h3>
                  <div className="stack" style={{ fontSize: "0.82rem" }}>
                    {regression.newlyPassing.slice(0, 3).map((c) => (
                      <div key={c.id} className="compactRow" style={{ padding: "0.4rem 0.6rem" }}>
                        <span>{c.name}</span>
                        <span className="pill good">PASSED</span>
                      </div>
                    ))}
                    {regression.newlyPassing.length === 0 && (
                      <span className="muted" style={{ display: "block", padding: "0.4rem 0" }}>
                        None
                      </span>
                    )}
                  </div>
                </div>

                <div>
                  <h3
                    style={{
                      fontSize: "0.85rem",
                      fontWeight: "bold",
                      marginBottom: "0.5rem",
                      display: "flex",
                      alignItems: "center",
                      gap: "0.35rem"
                    }}
                  >
                    <span
                      style={{
                        display: "inline-block",
                        width: "8px",
                        height: "8px",
                        borderRadius: "50%",
                        backgroundColor: "#ef4444"
                      }}
                    ></span>
                    Newly failing ({regression.newlyFailing.length})
                  </h3>
                  <div className="stack" style={{ fontSize: "0.82rem" }}>
                    {regression.newlyFailing.slice(0, 3).map((c) => (
                      <div key={c.id} className="compactRow" style={{ padding: "0.4rem 0.6rem" }}>
                        <span>{c.name}</span>
                        <span className="pill bad">FAILED</span>
                      </div>
                    ))}
                    {regression.newlyFailing.length === 0 && (
                      <span className="muted" style={{ display: "block", padding: "0.4rem 0" }}>
                        None
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Runtime Guardrails & Infrastructure Summary */}
            <div className="panel">
              <div className="panelHeader">
                <div>
                  <h2>Runtime policies & guardrails</h2>
                  <span>Active security & platform interfaces</span>
                </div>
                <Link href="/audit-logs" className="viewAllLink">
                  Audit Logs →
                </Link>
              </div>

              <div className="guardrailSummaryList">
                <Link href="/approval-queue" className="guardrailRow">
                  <div className="guardrailLeft">
                    <div className="guardrailIcon">🛡️</div>
                    <div className="guardrailMeta">
                      <span className="guardrailTitle">Capability Approval Gates</span>
                      <span className="guardrailDesc">
                        {dashboard.approvalGates.length} active human-in-the-loop policies
                      </span>
                    </div>
                  </div>
                  <span className="guardrailAction">Manage Gates →</span>
                </Link>

                <Link href="/feature-flags" className="guardrailRow">
                  <div className="guardrailLeft">
                    <div className="guardrailIcon">🚩</div>
                    <div className="guardrailMeta">
                      <span className="guardrailTitle">Capability Feature Flags</span>
                      <span className="guardrailDesc">
                        {dashboard.featureFlags.length} configured ({disabledCriticalFlags} guarded / disabled)
                      </span>
                    </div>
                  </div>
                  <span className="guardrailAction">Configure Flags →</span>
                </Link>

                <Link href="/mcp" className="guardrailRow">
                  <div className="guardrailLeft">
                    <div className="guardrailIcon">🔌</div>
                    <div className="guardrailMeta">
                      <span className="guardrailTitle">Model Context Protocol (MCP)</span>
                      <span className="guardrailDesc">
                        {registeredMcpServers} gateway interface(s) registered
                      </span>
                    </div>
                  </div>
                  <span className="guardrailAction">View Gateway →</span>
                </Link>

                <Link href="/traces" className="guardrailRow">
                  <div className="guardrailLeft">
                    <div className="guardrailIcon">📡</div>
                    <div className="guardrailMeta">
                      <span className="guardrailTitle">Tool Call Telemetry</span>
                      <span className="guardrailDesc">
                        {dashboard.metrics.toolCalls} calls recorded ({dashboard.metrics.blockedToolCalls} blocked)
                      </span>
                    </div>
                  </div>
                  <span className="guardrailAction">Inspect Traces →</span>
                </Link>
              </div>
            </div>
          </div>
        </section>
      </main>
    </>
  );
}
