"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { statusClass } from "../../lib/api";

type ExecutionItem = {
  id: string;
  status: string;
  objective: string;
  riskScore: number;
  createdAt: string;
  completedAt?: string | null;
  agent?: { id: string; name: string };
  contract?: { id: string; name: string; version: number } | null;
  _count?: { toolCallTraces: number; evalRuns: number };
};

function formatDate(d: string | null | undefined) {
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

export function ExecutionExplorer({ executions }: { executions: ExecutionItem[] }) {
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");

  // Summary Metrics
  const totalRuns = executions.length;
  const waitingApproval = executions.filter(e => e.status === "WAITING_FOR_APPROVAL").length;
  const completedRuns = executions.filter(e => e.status === "COMPLETED" || e.status === "SUCCEEDED").length;
  const failedRuns = executions.filter(e => e.status === "FAILED").length;
  const highRiskRuns = executions.filter(e => (e.riskScore ?? 0) >= 70).length;

  const filteredExecutions = useMemo(() => {
    return executions.filter(exec => {
      const matchesStatus = statusFilter === "ALL" || exec.status === statusFilter;
      const searchLower = searchTerm.toLowerCase();
      const matchesSearch =
        !searchTerm ||
        exec.id.toLowerCase().includes(searchLower) ||
        (exec.objective && exec.objective.toLowerCase().includes(searchLower)) ||
        (exec.agent?.name && exec.agent.name.toLowerCase().includes(searchLower)) ||
        (exec.contract?.name && exec.contract.name.toLowerCase().includes(searchLower));
      return matchesStatus && matchesSearch;
    });
  }, [executions, statusFilter, searchTerm]);

  return (
    <div className="explorerContainer">
      {/* Top Summary Metrics */}
      <div className="statsGrid">
        <div className="statCard">
          <span className="statLabel">Total Executions</span>
          <div className="statValue">{totalRuns}</div>
          <span className="statSub">Across all contracts</span>
        </div>

        <div className="statCard">
          <span className="statLabel">Waiting Approval</span>
          <div className="statValue" style={{ color: waitingApproval > 0 ? "#f59e0b" : "#0f172a" }}>
            {waitingApproval}
          </div>
          <span className="statSub">{waitingApproval > 0 ? "Requires human review" : "Queue is clear"}</span>
        </div>

        <div className="statCard">
          <span className="statLabel">Completed Succeeded</span>
          <div className="statValue" style={{ color: "#10b981" }}>
            {completedRuns}
          </div>
          <span className="statSub">Verified task outputs</span>
        </div>

        <div className="statCard">
          <span className="statLabel">High Risk Intercepts</span>
          <div className="statValue" style={{ color: highRiskRuns > 0 ? "#ef4444" : "#64748b" }}>
            {highRiskRuns}
          </div>
          <span className="statSub">Risk score ≥ 70</span>
        </div>
      </div>

      {/* Filter & Search Bar */}
      <div className="filterToolbar">
        <div className="searchBox">
          <span className="searchIcon">🔍</span>
          <input
            type="text"
            placeholder="Search by objective, execution ID, agent, or contract..."
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
            { id: "ALL", label: "All Runs" },
            { id: "WAITING_FOR_APPROVAL", label: "Waiting Approval" },
            { id: "RUNNING", label: "Running" },
            { id: "COMPLETED", label: "Completed" },
            { id: "SUCCEEDED", label: "Succeeded" },
            { id: "FAILED", label: "Failed" }
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

      {/* Execution Cards List */}
      {filteredExecutions.length === 0 ? (
        <div className="emptyStateCard">
          <div className="emptyIcon">✦</div>
          <h3 className="emptyTitle">No executions match your filter</h3>
          <p className="emptyMessage">
            Try adjusting your search query or switching to "All Runs" to view past agent executions.
          </p>
        </div>
      ) : (
        <div className="cardsList">
          {filteredExecutions.map(exec => {
            const risk = exec.riskScore ?? 0;
            const riskLevel = risk >= 70 ? "critical" : risk >= 40 ? "warning" : "low";

            return (
              <div key={exec.id} className="executionCard">
                <div className="cardHeader">
                  <div className="cardHeaderLeft">
                    <span className="idBadge">
                      ID: <code>{exec.id}</code>
                    </span>
                    <span className={statusClass(exec.status)}>
                      {exec.status}
                    </span>
                  </div>
                  <div className="cardHeaderRight">
                    <span className="timeText">{formatDate(exec.createdAt)}</span>
                    <span className={`riskPill ${riskLevel}`}>
                      Risk Score: <strong>{risk} / 100</strong>
                    </span>
                  </div>
                </div>

                <div className="cardBody">
                  <h3 className="objectiveTitle">
                    {exec.objective || "Autonomous execution task without specified objective"}
                  </h3>

                  <div className="metaRow">
                    <div className="metaItem">
                      <span className="metaLabel">Agent:</span>
                      <span className="metaValue">🤖 {exec.agent?.name || "Anonymous Agent"}</span>
                    </div>

                    {exec.contract && (
                      <div className="metaItem">
                        <span className="metaLabel">Task Contract:</span>
                        <span className="metaValue">📜 {exec.contract.name} (v{exec.contract.version})</span>
                      </div>
                    )}

                    {exec._count && (
                      <div className="metaItem">
                        <span className="metaLabel">Telemetry:</span>
                        <span className="metaValue">
                          {exec._count.toolCallTraces} tool traces · {exec._count.evalRuns} evals
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                <div className="cardFooter">
                  <div className="footerLeft">
                    {exec.status === "WAITING_FOR_APPROVAL" && (
                      <span className="actionAlert">
                        ⚠️ Paused at Human Approval Gate
                      </span>
                    )}
                  </div>
                  <Link href={`/executions/${exec.id}`} className="viewDetailsBtn">
                    View Full Execution Audit →
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <style jsx>{`
        .explorerContainer {
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

        /* Cards List */
        .cardsList {
          display: flex;
          flex-direction: column;
          gap: 14px;
        }

        .executionCard {
          background: #ffffff;
          border: 1px solid #e2e8f0;
          border-radius: 12px;
          padding: 18px 22px;
          display: flex;
          flex-direction: column;
          gap: 14px;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04);
          transition: all 0.15s ease;
        }

        .executionCard:hover {
          border-color: #cbd5e1;
          box-shadow: 0 6px 16px -2px rgba(0, 0, 0, 0.06);
          transform: translateY(-1px);
        }

        .cardHeader {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          flex-wrap: wrap;
          padding-bottom: 12px;
          border-bottom: 1px solid #f1f5f9;
        }

        .cardHeaderLeft {
          display: flex;
          align-items: center;
          gap: 10px;
        }

        .idBadge {
          font-size: 0.8rem;
          color: #64748b;
        }

        .idBadge code {
          color: #2563eb;
          font-weight: 700;
          background: #eff6ff;
          padding: 2px 6px;
          border-radius: 4px;
        }

        .cardHeaderRight {
          display: flex;
          align-items: center;
          gap: 12px;
        }

        .timeText {
          font-size: 0.8rem;
          color: #64748b;
        }

        .riskPill {
          font-size: 0.75rem;
          padding: 3px 10px;
          border-radius: 999px;
          font-weight: 600;
        }

        .riskPill.critical {
          background: #fef2f2;
          color: #b91c1c;
          border: 1px solid #fecaca;
        }

        .riskPill.warning {
          background: #fffbeb;
          color: #b45309;
          border: 1px solid #fde68a;
        }

        .riskPill.low {
          background: #f0fdf4;
          color: #15803d;
          border: 1px solid #bbf7d0;
        }

        .objectiveTitle {
          margin: 0;
          font-size: 1.05rem;
          font-weight: 700;
          color: #0f172a;
          line-height: 1.4;
        }

        .metaRow {
          display: flex;
          align-items: center;
          gap: 18px;
          flex-wrap: wrap;
          margin-top: 8px;
        }

        .metaItem {
          display: flex;
          align-items: center;
          gap: 6px;
          font-size: 0.84rem;
        }

        .metaLabel {
          color: #64748b;
          font-weight: 500;
        }

        .metaValue {
          color: #334155;
          font-weight: 600;
        }

        .cardFooter {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding-top: 10px;
          border-top: 1px solid #f8fafc;
        }

        .actionAlert {
          font-size: 0.8rem;
          font-weight: 700;
          color: #b45309;
          background: #fffbeb;
          padding: 3px 10px;
          border-radius: 4px;
          border: 1px solid #fde68a;
        }

        .viewDetailsBtn {
          margin-left: auto;
          background: #f1f5f9;
          color: #1e293b;
          padding: 7px 14px;
          border-radius: 6px;
          font-size: 0.82rem;
          font-weight: 700;
          text-decoration: none;
          transition: all 0.15s ease;
        }

        .viewDetailsBtn:hover {
          background: #2563eb;
          color: #ffffff;
        }

        .emptyStateCard {
          background: #ffffff;
          border: 1px solid #e2e8f0;
          border-radius: 12px;
          padding: 60px 20px;
          text-align: center;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
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
          margin-bottom: 8px;
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
          margin: 0;
        }

        @media (max-width: 768px) {
          .cardHeader {
            flex-direction: column;
            align-items: flex-start;
          }
          .cardFooter {
            flex-direction: column;
            align-items: flex-start;
            gap: 10px;
          }
          .viewDetailsBtn {
            margin-left: 0;
            width: 100%;
            text-align: center;
          }
        }
      `}</style>
    </div>
  );
}
