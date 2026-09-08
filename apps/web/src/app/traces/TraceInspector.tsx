"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { statusClass } from "../../lib/api";

type TraceItem = {
  id: string;
  toolName: string;
  status: string;
  input: any;
  output?: any;
  error?: string | null;
  latencyMs?: number | null;
  createdAt?: string;
  startedAt?: string;
  completedAt?: string | null;
  agent?: { id: string; name: string };
  executionId?: string;
};

function formatDate(d?: string | null) {
  if (!d) return "n/a";
  try {
    return new Date(d).toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit"
    });
  } catch {
    return String(d);
  }
}

export function TraceInspector({
  traces,
  initialExecutionId
}: {
  traces: TraceItem[];
  initialExecutionId?: string;
}) {
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [expandedTraceId, setExpandedTraceId] = useState<string | null>(null);

  // Metrics
  const totalTraces = traces.length;
  const successfulTraces = traces.filter(t => t.status === "SUCCEEDED" || t.status === "SUCCESS").length;
  const blockedTraces = traces.filter(t => t.status === "BLOCKED").length;
  
  const latencies = traces.map(t => t.latencyMs).filter((l): l is number => typeof l === "number" && l >= 0);
  const avgLatency = latencies.length > 0 ? Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length) : null;

  const filteredTraces = useMemo(() => {
    return traces.filter(trace => {
      const matchesStatus =
        statusFilter === "ALL" ||
        trace.status === statusFilter ||
        (statusFilter === "SUCCESS" && (trace.status === "SUCCEEDED" || trace.status === "SUCCESS"));
      
      const searchLower = searchTerm.toLowerCase();
      const matchesSearch =
        !searchTerm ||
        trace.id.toLowerCase().includes(searchLower) ||
        trace.toolName.toLowerCase().includes(searchLower) ||
        (trace.agent?.name && trace.agent.name.toLowerCase().includes(searchLower)) ||
        (trace.executionId && trace.executionId.toLowerCase().includes(searchLower));

      return matchesStatus && matchesSearch;
    });
  }, [traces, statusFilter, searchTerm]);

  const toggleExpand = (id: string) => {
    setExpandedTraceId(expandedTraceId === id ? null : id);
  };

  return (
    <div className="inspectorContainer">
      {/* KPI Observability Cards */}
      <div className="statsGrid">
        <div className="statCard">
          <span className="statLabel">Total Tool Invocations</span>
          <div className="statValue">{totalTraces}</div>
          <span className="statSub">Monitored gateway calls</span>
        </div>

        <div className="statCard">
          <span className="statLabel">Successful Calls</span>
          <div className="statValue" style={{ color: "#10b981" }}>
            {successfulTraces}
          </div>
          <span className="statSub">Verified schema execution</span>
        </div>

        <div className="statCard">
          <span className="statLabel">Blocked Policy Violations</span>
          <div className="statValue" style={{ color: blockedTraces > 0 ? "#ef4444" : "#64748b" }}>
            {blockedTraces}
          </div>
          <span className="statSub">{blockedTraces > 0 ? "Threat / Gate intercepts" : "Zero blocks"}</span>
        </div>

        <div className="statCard">
          <span className="statLabel">Average Latency</span>
          <div className="statValue" style={{ color: "#2563eb" }}>
            {avgLatency !== null ? `${avgLatency}ms` : "—"}
          </div>
          <span className="statSub">End-to-end round trip</span>
        </div>
      </div>

      {/* Filter Toolbar */}
      <div className="filterToolbar">
        <div className="searchBox">
          <span className="searchIcon">🔍</span>
          <input
            type="text"
            placeholder="Search by tool name, trace ID, or agent..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="searchInput"
          />
          {searchTerm && (
            <button onClick={() => setSearchTerm("")} className="clearBtn">✕</button>
          )}
        </div>

        <div className="filterTabs">
          {[
            { id: "ALL", label: "All Traces" },
            { id: "SUCCESS", label: "Successful" },
            { id: "BLOCKED", label: "Blocked by Policy" },
            { id: "FAILED", label: "Failed / Errors" }
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setStatusFilter(tab.id)}
              className={`filterTab ${statusFilter === tab.id ? "active" : ""}`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {initialExecutionId && (
        <div className="filterBanner">
          <span>Filtering by Execution: <code>{initialExecutionId}</code></span>
          <Link href="/traces" className="clearFilterLink">Clear Execution Filter ✕</Link>
        </div>
      )}

      {/* Traces List */}
      {filteredTraces.length === 0 ? (
        <div className="emptyStateCard">
          <div className="emptyIcon">✦</div>
          <h3 className="emptyTitle">No traces found</h3>
          <p className="emptyMessage">
            Tool call traces will be captured in real-time as agents invoke capabilities against the AgentReady gateway.
          </p>
        </div>
      ) : (
        <div className="tracesList">
          {filteredTraces.map(trace => {
            const isExpanded = expandedTraceId === trace.id;

            return (
              <div key={trace.id} className={`traceCard ${isExpanded ? "expanded" : ""}`}>
                <div className="traceHeader" onClick={() => toggleExpand(trace.id)}>
                  <div className="traceHeaderLeft">
                    <span className="toolBadge">
                      🔧 <code>{trace.toolName}</code>
                    </span>
                    <span className={statusClass(trace.status)}>
                      {trace.status}
                    </span>
                    {trace.latencyMs !== null && trace.latencyMs !== undefined && (
                      <span className="latencyPill">
                        ⚡ {trace.latencyMs}ms
                      </span>
                    )}
                  </div>

                  <div className="traceHeaderRight">
                    <span className="agentText">🤖 {trace.agent?.name || "Agent"}</span>
                    <span className="timeText">{formatDate(trace.createdAt || trace.startedAt)}</span>
                    <button type="button" className="expandToggleBtn">
                      {isExpanded ? "Collapse ▲" : "Inspect Trace ▼"}
                    </button>
                  </div>
                </div>

                {isExpanded && (
                  <div className="traceDetailsPanel">
                    <div className="traceDetailsGrid">
                      {/* Input Arguments */}
                      <div className="payloadColumn">
                        <div className="payloadHeader">
                          <span>📥 Tool Call Input Arguments</span>
                          <span className="payloadType">JSON</span>
                        </div>
                        <pre className="payloadPre">
                          {typeof trace.input === "object"
                            ? JSON.stringify(trace.input, null, 2)
                            : String(trace.input || "No input payload")}
                        </pre>
                      </div>

                      {/* Output / Result */}
                      <div className="payloadColumn">
                        <div className="payloadHeader">
                          <span>
                            {trace.status === "BLOCKED" || trace.error ? "⚠️ Interception / Error Reason" : "📤 Execution Output"}
                          </span>
                          <span className="payloadType">JSON</span>
                        </div>
                        <pre className={`payloadPre ${trace.error ? "errorText" : ""}`}>
                          {trace.error
                            ? trace.error
                            : trace.output
                            ? JSON.stringify(trace.output, null, 2)
                            : "No output data returned"}
                        </pre>
                      </div>
                    </div>

                    <div className="traceFooter">
                      <span className="traceIdTag">Trace ID: <code>{trace.id}</code></span>
                      {trace.executionId && (
                        <Link href={`/executions/${trace.executionId}`} className="execLink">
                          View Parent Execution ({trace.executionId.slice(0, 14)}…) →
                        </Link>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <style jsx>{`
        .inspectorContainer {
          display: flex;
          flex-direction: column;
          gap: 20px;
        }

        .statsGrid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
          gap: 14px;
        }

        .statCard {
          background: #ffffff;
          border: 1px solid #e2e8f0;
          border-radius: 10px;
          padding: 16px 20px;
          display: flex;
          flex-direction: column;
          gap: 4px;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04);
        }

        .statLabel {
          font-size: 0.75rem;
          font-weight: 700;
          color: #64748b;
          text-transform: uppercase;
          letter-spacing: 0.4px;
        }

        .statValue {
          font-size: 1.85rem;
          font-weight: 800;
          color: #0f172a;
          line-height: 1.1;
        }

        .statSub {
          font-size: 0.78rem;
          color: #94a3b8;
        }

        /* Filter Toolbar */
        .filterToolbar {
          display: flex;
          flex-direction: column;
          gap: 12px;
          background: #ffffff;
          border: 1px solid #e2e8f0;
          border-radius: 10px;
          padding: 14px 16px;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.03);
        }

        .searchBox {
          display: flex;
          align-items: center;
          gap: 10px;
          background: #f8fafc;
          border: 1px solid #e2e8f0;
          border-radius: 8px;
          padding: 8px 14px;
        }

        .searchIcon {
          font-size: 0.95rem;
          color: #94a3b8;
        }

        .searchInput {
          border: none;
          background: none;
          font-size: 0.88rem;
          color: #0f172a;
          width: 100%;
          outline: none;
        }

        .clearBtn {
          background: none;
          border: none;
          color: #94a3b8;
          cursor: pointer;
          font-size: 0.85rem;
        }

        .filterTabs {
          display: flex;
          gap: 6px;
          overflow-x: auto;
          scrollbar-width: none;
        }

        .filterTab {
          background: none;
          border: 1px solid transparent;
          padding: 6px 14px;
          border-radius: 6px;
          font-size: 0.82rem;
          font-weight: 600;
          color: #64748b;
          cursor: pointer;
          white-space: nowrap;
          transition: all 0.15s ease;
        }

        .filterTab:hover {
          background: #f1f5f9;
          color: #0f172a;
        }

        .filterTab.active {
          background: #eff6ff;
          border-color: #bfdbfe;
          color: #2563eb;
        }

        .filterBanner {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 10px 16px;
          background: #f0fdf4;
          border: 1px solid #bbf7d0;
          border-radius: 8px;
          font-size: 0.85rem;
          color: #166534;
        }

        .filterBanner code {
          font-weight: 700;
          background: #ffffff;
          padding: 2px 6px;
          border-radius: 4px;
        }

        .clearFilterLink {
          color: #15803d;
          font-weight: 700;
          text-decoration: none;
          font-size: 0.82rem;
        }

        /* Traces List */
        .tracesList {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        .traceCard {
          background: #ffffff;
          border: 1px solid #e2e8f0;
          border-radius: 10px;
          overflow: hidden;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.03);
          transition: all 0.15s ease;
        }

        .traceCard:hover {
          border-color: #cbd5e1;
        }

        .traceCard.expanded {
          border-color: #93c5fd;
          box-shadow: 0 4px 14px rgba(37, 99, 235, 0.08);
        }

        .traceHeader {
          padding: 14px 18px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          cursor: pointer;
          user-select: none;
          gap: 12px;
          flex-wrap: wrap;
        }

        .traceHeaderLeft {
          display: flex;
          align-items: center;
          gap: 10px;
        }

        .toolBadge {
          font-size: 0.9rem;
          font-weight: 700;
          color: #0f172a;
        }

        .toolBadge code {
          background: #f1f5f9;
          padding: 3px 8px;
          border-radius: 5px;
          color: #1e293b;
        }

        .latencyPill {
          font-size: 0.75rem;
          font-weight: 700;
          background: #eff6ff;
          color: #2563eb;
          padding: 2px 8px;
          border-radius: 999px;
        }

        .traceHeaderRight {
          display: flex;
          align-items: center;
          gap: 14px;
        }

        .agentText {
          font-size: 0.84rem;
          color: #475569;
          font-weight: 500;
        }

        .timeText {
          font-size: 0.8rem;
          color: #64748b;
        }

        .expandToggleBtn {
          background: #f8fafc;
          border: 1px solid #e2e8f0;
          padding: 5px 12px;
          border-radius: 6px;
          font-size: 0.78rem;
          font-weight: 700;
          color: #475569;
          cursor: pointer;
          transition: all 0.15s ease;
        }

        .expandToggleBtn:hover {
          background: #eff6ff;
          color: #2563eb;
          border-color: #bfdbfe;
        }

        /* Details Panel */
        .traceDetailsPanel {
          padding: 16px 18px;
          background: #f8fafc;
          border-top: 1px solid #e2e8f0;
          display: flex;
          flex-direction: column;
          gap: 14px;
        }

        .traceDetailsGrid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 14px;
        }

        .payloadColumn {
          background: #ffffff;
          border: 1px solid #e2e8f0;
          border-radius: 8px;
          overflow: hidden;
          display: flex;
          flex-direction: column;
        }

        .payloadHeader {
          padding: 8px 12px;
          background: #f1f5f9;
          border-bottom: 1px solid #e2e8f0;
          display: flex;
          align-items: center;
          justify-content: space-between;
          font-size: 0.78rem;
          font-weight: 700;
          color: #334155;
        }

        .payloadType {
          font-size: 0.7rem;
          color: #64748b;
          font-family: monospace;
        }

        .payloadPre {
          margin: 0;
          padding: 12px;
          background: #0f172a;
          color: #e2e8f0;
          font-family: monospace;
          font-size: 0.78rem;
          line-height: 1.4;
          overflow-x: auto;
          max-height: 240px;
        }

        .payloadPre.errorText {
          color: #fca5a5;
          background: #1e1b1e;
        }

        .traceFooter {
          display: flex;
          align-items: center;
          justify-content: space-between;
          font-size: 0.8rem;
          color: #64748b;
          padding-top: 4px;
        }

        .traceIdTag code {
          color: #475569;
        }

        .execLink {
          color: #2563eb;
          font-weight: 700;
          text-decoration: none;
        }

        .execLink:hover {
          text-decoration: underline;
        }

        .emptyStateCard {
          background: #ffffff;
          border: 1px solid #e2e8f0;
          border-radius: 12px;
          padding: 60px 20px;
          text-align: center;
        }

        .emptyIcon {
          width: 48px;
          height: 48px;
          background: #f1f5f9;
          color: #94a3b8;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 1.4rem;
          margin: 0 auto 8px;
        }

        .emptyTitle {
          font-size: 1.1rem;
          font-weight: 700;
          color: #0f172a;
          margin: 0 0 6px 0;
        }

        .emptyMessage {
          font-size: 0.88rem;
          color: #64748b;
          max-width: 440px;
          margin: 0 auto;
        }

        @media (max-width: 768px) {
          .traceDetailsGrid {
            grid-template-columns: 1fr;
          }
          .traceHeader {
            flex-direction: column;
            align-items: flex-start;
          }
        }
      `}</style>
    </div>
  );
}
