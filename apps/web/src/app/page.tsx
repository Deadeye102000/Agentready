import Link from "next/link";
import { Navbar } from "../components/Navbar";
import { SandboxController } from "../components/SandboxController";
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
  const [dashboardRes, regressionRes] = await Promise.all([
    fetchDashboardData(),
    fetchRegressionData()
  ]);

  const dashboard = dashboardRes.data;
  const regression = regressionRes.data;

  // Metric Computations for 7 Overview KPI Cards
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

        <SandboxController />

        {/* 7 Required Overview Dashboard KPI Cards */}
        <section className="metricGrid" aria-label="Harness KPI Metrics">
          <div className="metricCard">
            <div className="metricHeader">
              <span className="metricLabel">Total Executions</span>
              <span className="pill">Runs</span>
            </div>
            <div className="metricValue">{totalExecutions}</div>
            <div className="metricSubtext">Lifetime agent execution runs</div>
          </div>

          <div className="metricCard">
            <div className="metricHeader">
              <span className="metricLabel">Success Rate</span>
              <span className={`pill ${successRate !== null && successRate >= 0.8 ? "good" : "warn"}`}>
                {formatPercent(successRate)}
              </span>
            </div>
            <div className="metricValue">{formatPercent(successRate)}</div>
            <div className="metricSubtext">Completed non-failed runs</div>
          </div>

          <div className="metricCard">
            <div className="metricHeader">
              <span className="metricLabel">Failed Executions</span>
              <span className={`pill ${failedExecutions > 0 ? "bad" : "good"}`}>
                {failedExecutions}
              </span>
            </div>
            <div className="metricValue">{failedExecutions}</div>
            <div className="metricSubtext">Terminal error state runs</div>
          </div>

          <div className="metricCard">
            <div className="metricHeader">
              <span className="metricLabel">Pending Approvals</span>
              <span className={`pill ${pendingApprovals > 0 ? "warn" : "good"}`}>
                {pendingApprovals}
              </span>
            </div>
            <div className="metricValue">{pendingApprovals}</div>
            <div className="metricSubtext">Awaiting human operator review</div>
          </div>

          <div className="metricCard">
            <div className="metricHeader">
              <span className="metricLabel">Eval Pass Rate</span>
              <span className={`pill ${evalPassRate !== null && evalPassRate >= 0.8 ? "good" : "warn"}`}>
                {formatPercent(evalPassRate)}
              </span>
            </div>
            <div className="metricValue">{formatPercent(evalPassRate)}</div>
            <div className="metricSubtext">Compliance suite pass rate</div>
          </div>

          <div className="metricCard">
            <div className="metricHeader">
              <span className="metricLabel">Disabled Flags</span>
              <span className={`pill ${disabledCriticalFlags > 0 ? "warn" : "good"}`}>
                {disabledCriticalFlags}
              </span>
            </div>
            <div className="metricValue">{disabledCriticalFlags}</div>
            <div className="metricSubtext">Capabilities currently blocked</div>
          </div>

          <div className="metricCard">
            <div className="metricHeader">
              <span className="metricLabel">MCP Servers</span>
              <span className="pill good">{registeredMcpServers}</span>
            </div>
            <div className="metricValue">{registeredMcpServers}</div>
            <div className="metricSubtext">Registered gateway interfaces</div>
          </div>
        </section>

        {/* Dashboard Workspace Panels */}
        <section className="workspace">
          {/* Evaluation Regression Card */}
          <div className="panel wide">
            <div className="panelHeader">
              <h2>Evaluation regression analysis</h2>
              <span>Comparing latest run batch against historical baseline</span>
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
                <span className="muted" style={{ fontSize: "0.875rem" }}>
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
                <span className="muted" style={{ fontSize: "0.875rem" }}>
                  Previous: {formatPercent(regression.previousPassRate)}
                </span>
              </div>
            </div>

            <div style={{ marginTop: "1.5rem", display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
              <div>
                <h3
                  style={{
                    fontSize: "0.9rem",
                    fontWeight: "bold",
                    marginBottom: "0.5rem",
                    display: "flex",
                    alignItems: "center",
                    gap: "0.25rem"
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
                <div className="stack" style={{ fontSize: "0.875rem" }}>
                  {regression.newlyPassing.map((c) => (
                    <div key={c.id} className="compactRow" style={{ padding: "0.5rem 0" }}>
                      <span>{c.name}</span>
                      <span className="pill good">PASSED</span>
                    </div>
                  ))}
                  {regression.newlyPassing.length === 0 && (
                    <span className="muted" style={{ display: "block", padding: "0.5rem 0" }}>
                      None
                    </span>
                  )}
                </div>
              </div>

              <div>
                <h3
                  style={{
                    fontSize: "0.9rem",
                    fontWeight: "bold",
                    marginBottom: "0.5rem",
                    display: "flex",
                    alignItems: "center",
                    gap: "0.25rem"
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
                <div className="stack" style={{ fontSize: "0.875rem" }}>
                  {regression.newlyFailing.map((c) => (
                    <div key={c.id} className="compactRow" style={{ padding: "0.5rem 0" }}>
                      <span>{c.name}</span>
                      <span className="pill bad">FAILED</span>
                    </div>
                  ))}
                  {regression.newlyFailing.length === 0 && (
                    <span className="muted" style={{ display: "block", padding: "0.5rem 0" }}>
                      None
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Execution Harness */}
          <div className="panel wide">
            <div className="panelHeader">
              <h2>Execution harness</h2>
              <span>{dashboard.metrics.failedExecutions} failed</span>
            </div>
            {dashboard.recentExecutions.length > 0 ? (
              <div className="executionList">
                {dashboard.recentExecutions.map((execution) => (
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
                        <span>Risk {execution.riskScore}</span>
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

          {/* Pending Approvals */}
          <div className="panel">
            <div className="panelHeader">
              <h2>Pending approvals</h2>
              <span>{dashboard.pendingApprovalsList.length} request(s)</span>
            </div>
            {dashboard.pendingApprovalsList.length > 0 ? (
              <div className="stack">
                {dashboard.pendingApprovalsList.map((request) => (
                  <div className="compactRow" key={request.id}>
                    <div>
                      <strong>{request.requestedAction}</strong>
                      <span className="muted">
                        {request.agent.name} · {request.reason}
                      </span>
                    </div>
                    <span className="pill warn">{request.status}</span>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState
                title="No Pending Approvals"
                message="All caught up! No high-risk actions are awaiting human review."
              />
            )}
          </div>

          {/* Approval Gates */}
          <div className="panel">
            <div className="panelHeader">
              <h2>Approval gates</h2>
              <span>{dashboard.approvalGates.length} active</span>
            </div>
            {dashboard.approvalGates.length > 0 ? (
              <div className="stack">
                {dashboard.approvalGates.map((gate) => (
                  <div className="compactRow" key={gate.id}>
                    <div>
                      <strong>{gate.capability}</strong>
                      <span>{gate.reason || "No policy note provided"}</span>
                    </div>
                    <span className={`pill ${statusClass(gate.mode)}`}>{gate.mode}</span>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState
                title="No Approval Gates"
                message="Configure approval gates to enforce policies on risky tool capabilities."
              />
            )}
          </div>

          {/* Tool Tracing */}
          <div className="panel">
            <div className="panelHeader">
              <h2>Tool-call tracing</h2>
              <span>{dashboard.metrics.blockedToolCalls} blocked</span>
            </div>
            {dashboard.recentToolCalls.length > 0 ? (
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
            ) : (
              <EmptyState
                title="No Tool Traces"
                message="No agent tool calls logged yet in this workspace."
              />
            )}
          </div>

          {/* Eval Runs */}
          <div className="panel">
            <div className="panelHeader">
              <h2>Eval runs</h2>
              <span>{dashboard.metrics.evalRuns} total</span>
            </div>
            {dashboard.recentEvalRuns.length > 0 ? (
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
            ) : (
              <EmptyState
                title="No Eval Runs"
                message="Execute an evaluation suite to verify agent compliance against contracts."
              />
            )}
          </div>

          {/* Capability Flags */}
          <div className="panel">
            <div className="panelHeader">
              <h2>Capability flags</h2>
              <span>{dashboard.featureFlags.length} flags</span>
            </div>
            {dashboard.featureFlags.length > 0 ? (
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
            ) : (
              <EmptyState
                title="No Feature Flags"
                message="No feature flags configured for this organization."
              />
            )}
          </div>

          {/* MCP Server Support */}
          <div className="panel wide">
            <div className="panelHeader">
              <h2>Registered MCP servers</h2>
              <span>{dashboard.mcpServers.length} server(s)</span>
            </div>
            {dashboard.mcpServers.length > 0 ? (
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
            ) : (
              <EmptyState
                title="No MCP Servers Registered"
                message="Register Model Context Protocol servers to expose external tools to your agents."
              />
            )}
          </div>
        </section>
      </main>
    </>
  );
}
