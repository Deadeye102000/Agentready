import Link from "next/link";
import { Navbar } from "../../../components/Navbar";
import {
  fetchExecutionDetail,
  fetchToolCallTraces,
  formatPercent,
  statusClass
} from "../../../lib/api";

function formatDate(dateStr: string | null) {
  if (!dateStr) return "n/a";
  try {
    return new Date(dateStr).toLocaleString();
  } catch {
    return dateStr;
  }
}

function calculateDuration(start: string | null, end: string | null) {
  if (!start) return "n/a";
  const startTime = new Date(start).getTime();
  const endTime = end ? new Date(end).getTime() : Date.now();
  const diffMs = endTime - startTime;
  
  if (diffMs < 0) return "0s";
  if (diffMs < 1000) return `${diffMs}ms`;
  return `${(diffMs / 1000).toFixed(1)}s`;
}

function safeJsonSummary(val: any) {
  if (val === null || val === undefined) return "None";
  if (typeof val === "string") return val;
  try {
    const str = JSON.stringify(val);
    if (str.length > 120) {
      return str.slice(0, 120) + "...";
    }
    return str;
  } catch {
    return String(val);
  }
}

export default async function ExecutionDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = await params;
  const [executionRes, tracesRes] = await Promise.all([
    fetchExecutionDetail(resolvedParams.id),
    fetchToolCallTraces(resolvedParams.id)
  ]);

  const execution = executionRes.data;

  // Explicit error state if the execution failed to load or backend is disconnected — never silent fallback
  if (executionRes.error || !execution) {
    return (
      <>
        <Navbar orgName="Execution Context" />
        <main className="shell">
          <div style={{ marginBottom: "16px" }}>
            <Link href="/" className="retryBtn" style={{ textDecoration: "none", display: "inline-block" }}>
              ← Back to Dashboard
            </Link>
          </div>

          <div
            className="panel wide"
            style={{ borderLeft: "5px solid #ef4444", padding: "32px", marginTop: "16px" }}
            role="alert"
          >
            <div style={{ display: "flex", gap: "16px", alignItems: "flex-start" }}>
              <div style={{ fontSize: "2rem", lineHeight: 1 }}>⚠️</div>
              <div style={{ flex: 1 }}>
                <span className="pill bad" style={{ marginBottom: "8px", display: "inline-block" }}>
                  Execution Load Error
                </span>
                <h1 style={{ fontSize: "1.5rem", fontWeight: "700", margin: "8px 0" }}>
                  Unable to load execution details
                </h1>
                <p style={{ color: "#475569", margin: "8px 0 16px 0", fontSize: "0.95rem", lineHeight: 1.5 }}>
                  {executionRes.error || `Execution with ID "${resolvedParams.id}" was not found or could not be reached.`}
                </p>
                <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
                  <Link href={`/executions/${resolvedParams.id}`} className="retryBtn" style={{ textDecoration: "none" }}>
                    ↻ Retry Loading
                  </Link>
                  <Link href="/" style={{ fontSize: "0.85rem", color: "#3b82f6", textDecoration: "underline" }}>
                    Return to Overview
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </main>
      </>
    );
  }

  const isFailed = execution.status === "FAILED";
  const isSucceeded = execution.status === "SUCCEEDED";
  const isAwaitingApproval = execution.status === "WAITING_FOR_APPROVAL";

  // Real tool call traces fetched directly from GET /api/v1/tool-call-traces
  const traces = tracesRes.data?.data ?? execution.toolCallTraces ?? [];
  const pagination = tracesRes.data?.pagination;

  return (
    <>
      <Navbar orgName="Execution Context" />
      <main className="shell">
        <div style={{ marginBottom: "16px" }}>
          <Link href="/" className="retryBtn" style={{ textDecoration: "none", display: "inline-block" }}>
            ← Back to Dashboard
          </Link>
        </div>

        {/* Execution Summary Header Banner */}
        <div 
          className="panel wide" 
          style={{ 
            marginBottom: "16px",
            borderLeft: `5px solid ${isFailed ? "#ef4444" : isSucceeded ? "#10b981" : isAwaitingApproval ? "#eab308" : "#64748b"}` 
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "16px" }}>
            <div style={{ flex: "1" }}>
              <span className="brandBadge">Execution Detail</span>
              <h1 style={{ fontSize: "1.75rem", fontWeight: "800", marginTop: "4px" }}>
                {execution.objective}
              </h1>
              <p className="muted" style={{ marginTop: "6px" }}>
                ID: <code>{execution.id}</code> · Agent: <strong>{execution.agent.name}</strong>
              </p>
            </div>
            <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
              <span className={`pill ${statusClass(execution.status)}`} style={{ fontSize: "0.9rem", padding: "6px 14px" }}>
                {execution.status}
              </span>
              <span className="orgBadge">Risk Score: {execution.riskScore}</span>
            </div>
          </div>
        </div>

        {/* Metadata Details Grid */}
        <section className="metricGrid" style={{ marginBottom: "16px" }}>
          <div className="metricCard">
            <span className="metricLabel">Project</span>
            <div className="metricValue" style={{ fontSize: "1.1rem", fontWeight: "700", marginTop: "4px" }}>
              {execution.project?.name ?? "No Project Scope"}
            </div>
          </div>

          <div className="metricCard">
            <span className="metricLabel">Task Contract</span>
            <div className="metricValue" style={{ fontSize: "1.1rem", fontWeight: "700", marginTop: "4px" }}>
              {execution.contract?.name ?? "No Contract"}
            </div>
            {execution.contract && <div className="metricSubtext">v{execution.contract.version}</div>}
          </div>

          <div className="metricCard">
            <span className="metricLabel">Started At</span>
            <div className="metricValue" style={{ fontSize: "1rem", fontWeight: "700", marginTop: "4px" }}>
              {formatDate(execution.startedAt)}
            </div>
          </div>

          <div className="metricCard">
            <span className="metricLabel">Completed At</span>
            <div className="metricValue" style={{ fontSize: "1rem", fontWeight: "700", marginTop: "4px" }}>
              {formatDate(execution.completedAt)}
            </div>
          </div>

          <div className="metricCard">
            <span className="metricLabel">Duration</span>
            <div className="metricValue" style={{ fontSize: "1.25rem", fontWeight: "800", marginTop: "4px" }}>
              {calculateDuration(execution.startedAt, execution.completedAt)}
            </div>
          </div>
        </section>

        {/* Failure Reason Banner */}
        {execution.failureReason && (
          <div className="errorBanner" style={{ borderLeft: "5px solid #ef4444" }}>
            <div className="errorContent">
              <div className="errorIcon">!</div>
              <div className="errorText">
                <strong>Failure Reason</strong>
                <span>{execution.failureReason}</span>
              </div>
            </div>
          </div>
        )}

        {/* Trace Timeline Workspace */}
        <section className="workspace">
          <div className="panel wide">
            <div className="panelHeader" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <h2>Trace Timeline</h2>
                <span className="muted">
                  {pagination ? `${pagination.total} total traces (page ${pagination.page} of ${pagination.totalPages || 1})` : `${traces.length} recorded events`}
                </span>
              </div>
              <span className="pill good">GET /api/v1/tool-call-traces</span>
            </div>

            {tracesRes.error && (
              <div className="errorBanner" role="alert" style={{ marginTop: "1rem" }}>
                <div className="errorContent">
                  <div className="errorIcon">!</div>
                  <div className="errorText">
                    <strong>Traces Fetch Alert</strong>
                    <span>{tracesRes.error}</span>
                  </div>
                </div>
              </div>
            )}

            {traces.length > 0 ? (
              <div className="stack" style={{ marginTop: "1rem" }}>
                {traces.map((trace, index) => {
                  const isBlocked = trace.status === "BLOCKED";
                  const isTraceFailed = trace.status === "FAILED" || trace.error !== null;
                  const isTraceApprovalRequested = isBlocked && trace.error === "approval_requested";

                  let highlightStyle = {};
                  if (isTraceApprovalRequested) {
                    highlightStyle = { borderLeft: "4px solid #eab308", background: "#fffbeb" };
                  } else if (isTraceFailed) {
                    highlightStyle = { borderLeft: "4px solid #ef4444", background: "#fef2f2" };
                  }

                  return (
                    <div 
                      key={trace.id} 
                      className="compactRow" 
                      style={{ 
                        flexDirection: "column", 
                        alignItems: "stretch", 
                        padding: "16px",
                        ...highlightStyle
                      }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", width: "100%", flexWrap: "wrap", gap: "8px" }}>
                        <div>
                          <span className="muted" style={{ marginRight: "8px", fontWeight: "bold" }}>
                            #{index + 1}
                          </span>
                          <strong style={{ fontSize: "1.05rem" }}>
                            {trace.toolName}
                          </strong>
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                          <span className={`pill ${statusClass(trace.status)}`}>
                            {trace.status}
                          </span>
                          {trace.latencyMs !== null && (
                            <span className="pill">{trace.latencyMs}ms</span>
                          )}
                        </div>
                      </div>

                      <div style={{ marginTop: "12px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px", background: "rgba(0,0,0,0.02)", padding: "10px", borderRadius: "6px" }}>
                        <div>
                          <span className="muted" style={{ fontWeight: "600", fontSize: "0.75rem", textTransform: "uppercase" }}>Input Parameters</span>
                          <pre style={{ margin: "4px 0 0 0", fontSize: "0.8rem", whiteSpace: "pre-wrap", wordBreak: "break-all", color: "#334155" }}>
                            {safeJsonSummary(trace.input)}
                          </pre>
                        </div>
                        <div>
                          <span className="muted" style={{ fontWeight: "600", fontSize: "0.75rem", textTransform: "uppercase" }}>Output / Error Response</span>
                          <pre 
                            style={{ 
                              margin: "4px 0 0 0", 
                              fontSize: "0.8rem", 
                              whiteSpace: "pre-wrap", 
                              wordBreak: "break-all",
                              color: isTraceFailed ? "#991b1b" : "#334155" 
                            }}
                          >
                            {trace.error || safeJsonSummary(trace.output)}
                          </pre>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="emptyState" style={{ padding: "48px" }}>
                <div className="emptyIcon">✦</div>
                <div className="emptyTitle">No Trace Records Available</div>
                <div className="emptyMessage">This agent execution run did not invoke any custom tools or log any trace event details.</div>
              </div>
            )}
          </div>
        </section>
      </main>
    </>
  );
}
