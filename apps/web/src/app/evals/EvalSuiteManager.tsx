"use client";

import { useState } from "react";
import type { EvalCaseItem, EvalRunItem, RegressionData } from "../../lib/api";
import { formatPercent, runEvalCase, statusClass } from "../../lib/api";

function formatDate(d: string | null) {
  if (!d) return "n/a";
  try {
    return new Date(d).toLocaleString();
  } catch {
    return d;
  }
}

export function EvalSuiteManager({
  initialCases,
  initialRuns,
  initialRegression,
  initialError,
  orgName
}: {
  initialCases: EvalCaseItem[];
  initialRuns: EvalRunItem[];
  initialRegression: RegressionData | null;
  initialError: string | null;
  orgName?: string;
}) {
  const [cases, setCases] = useState<EvalCaseItem[]>(initialCases);
  const [runs, setRuns] = useState<EvalRunItem[]>(initialRuns);
  const [regression, setRegression] = useState<RegressionData | null>(initialRegression);
  const [error, setError] = useState<string | null>(initialError);
  const [runningCaseId, setRunningCaseId] = useState<string | null>(null);
  const [runResultNotice, setRunResultNotice] = useState<{ id: string; status: string; score: number | null } | null>(null);
  const [activeTab, setActiveTab] = useState<"CASES" | "RUNS">("CASES");

  const handleRunCase = async (caseId: string, caseName: string) => {
    setRunningCaseId(caseId);
    setRunResultNotice(null);

    const res = await runEvalCase(caseId);
    setRunningCaseId(null);

    if (res.error || !res.data) {
      alert(`Error running eval case "${caseName}": ${res.error}`);
      return;
    }

    const newRun = res.data as EvalRunItem;
    setRuns((prev) => [newRun, ...prev]);
    setRunResultNotice({
      id: newRun.id,
      status: newRun.status,
      score: newRun.score
    });
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
      {/* Page Header */}
      <div style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "flex-start",
        gap: "20px",
        flexWrap: "wrap",
        background: "#ffffff",
        border: "1px solid #e2e8f0",
        borderRadius: "12px",
        padding: "24px",
        boxShadow: "0 1px 3px rgba(0,0,0,0.04)"
      }}>
        <div style={{ maxWidth: "650px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "8px" }}>
            <h1 style={{ margin: 0, fontSize: "1.5rem", fontWeight: "800", color: "#0f172a" }}>
              Evaluation Suites &amp; Benchmarks
            </h1>
            <span style={{
              background: "#eff6ff",
              color: "#1d4ed8",
              border: "1px solid #bfdbfe",
              borderRadius: "999px",
              padding: "2px 10px",
              fontSize: "0.75rem",
              fontWeight: "700"
            }}>
              Regression Defense
            </span>
          </div>
          <p style={{ margin: 0, fontSize: "0.875rem", color: "#64748b", lineHeight: 1.5 }}>
            Automated test harnesses executing agent tasks against deterministic task contracts. Tracks score deltas, detects safety regressions, and asserts gate adherence.
          </p>
        </div>
      </div>

      {/* Backend Error Alert */}
      {error && (
        <div style={{
          background: "#fef2f2",
          border: "1px solid #fca5a5",
          borderRadius: "8px",
          padding: "16px 20px",
          color: "#991b1b"
        }}>
          <div style={{ fontWeight: "700", marginBottom: "4px" }}>Failed to Load Evaluation Data</div>
          <div style={{ fontSize: "0.875rem" }}>{error}</div>
        </div>
      )}

      {/* Regression KPI Cards */}
      {regression && (
        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
          gap: "16px"
        }}>
          <div style={{ background: "#ffffff", border: "1px solid #e2e8f0", borderRadius: "10px", padding: "18px" }}>
            <div style={{ fontSize: "0.75rem", fontWeight: "700", color: "#64748b", textTransform: "uppercase" }}>
              Current Eval Score
            </div>
            <div style={{ display: "flex", alignItems: "baseline", gap: "10px", marginTop: "4px" }}>
              <span style={{ fontSize: "1.8rem", fontWeight: "800", color: "#0f172a" }}>
                {formatPercent(regression.currentScore)}
              </span>
              {regression.delta !== null && (
                <span style={{
                  fontSize: "0.82rem",
                  fontWeight: "700",
                  color: regression.delta >= 0 ? "#16a34a" : "#dc2626"
                }}>
                  {regression.delta >= 0 ? `+${(regression.delta * 100).toFixed(1)}%` : `${(regression.delta * 100).toFixed(1)}%`}
                </span>
              )}
            </div>
            <div style={{ fontSize: "0.75rem", color: "#94a3b8", marginTop: "2px" }}>
              Prev: {formatPercent(regression.previousScore)}
            </div>
          </div>

          <div style={{ background: "#ffffff", border: "1px solid #e2e8f0", borderRadius: "10px", padding: "18px" }}>
            <div style={{ fontSize: "0.75rem", fontWeight: "700", color: "#64748b", textTransform: "uppercase" }}>
              Pass Rate Trend
            </div>
            <div style={{ display: "flex", alignItems: "baseline", gap: "10px", marginTop: "4px" }}>
              <span style={{ fontSize: "1.8rem", fontWeight: "800", color: "#0f172a" }}>
                {formatPercent(regression.currentPassRate)}
              </span>
              {regression.passRateChange !== null && (
                <span style={{
                  fontSize: "0.82rem",
                  fontWeight: "700",
                  color: regression.passRateChange >= 0 ? "#16a34a" : "#dc2626"
                }}>
                  {regression.passRateChange >= 0 ? `+${(regression.passRateChange * 100).toFixed(1)}%` : `${(regression.passRateChange * 100).toFixed(1)}%`}
                </span>
              )}
            </div>
            <div style={{ fontSize: "0.75rem", color: "#94a3b8", marginTop: "2px" }}>
              Prev: {formatPercent(regression.previousPassRate)}
            </div>
          </div>

          <div style={{ background: "#ffffff", border: "1px solid #e2e8f0", borderRadius: "10px", padding: "18px" }}>
            <div style={{ fontSize: "0.75rem", fontWeight: "700", color: "#64748b", textTransform: "uppercase" }}>
              Failing Regressions
            </div>
            <div style={{ fontSize: "1.8rem", fontWeight: "800", color: regression.newlyFailing.length > 0 ? "#dc2626" : "#16a34a", marginTop: "4px" }}>
              {regression.newlyFailing.length}
            </div>
            <div style={{ fontSize: "0.75rem", color: "#94a3b8", marginTop: "2px" }}>
              {regression.newlyPassing.length} newly passing tests
            </div>
          </div>
        </div>
      )}

      {/* Success Banner when run completes */}
      {runResultNotice && (
        <div style={{
          background: runResultNotice.status === "PASSED" ? "#f0fdf4" : "#fef2f2",
          border: "1px solid",
          borderColor: runResultNotice.status === "PASSED" ? "#bbf7d0" : "#fca5a5",
          borderRadius: "8px",
          padding: "14px 18px",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          color: runResultNotice.status === "PASSED" ? "#166534" : "#991b1b"
        }}>
          <div>
            <strong>Evaluation Run Completed: </strong>
            <span>Status: <strong>{runResultNotice.status}</strong></span>
            {runResultNotice.score !== null && (
              <span> | Score: <strong>{formatPercent(runResultNotice.score)}</strong></span>
            )}
            <span style={{ fontSize: "0.78rem", marginLeft: "10px" }}>(Run ID: {runResultNotice.id})</span>
          </div>
          <button
            onClick={() => setRunResultNotice(null)}
            style={{ background: "transparent", border: "none", cursor: "pointer", color: "inherit", fontWeight: "700" }}
          >
            ✕
          </button>
        </div>
      )}

      {/* Tab Selector */}
      <div style={{ display: "flex", gap: "8px", borderBottom: "1px solid #e2e8f0", paddingBottom: "12px" }}>
        <button
          id="tab-eval-cases"
          onClick={() => setActiveTab("CASES")}
          style={{
            padding: "8px 16px",
            borderRadius: "6px",
            border: "1px solid",
            borderColor: activeTab === "CASES" ? "#2563eb" : "#e2e8f0",
            background: activeTab === "CASES" ? "#eff6ff" : "#ffffff",
            color: activeTab === "CASES" ? "#1d4ed8" : "#475569",
            fontWeight: "700",
            fontSize: "0.85rem",
            cursor: "pointer"
          }}
        >
          Test Cases ({cases.length})
        </button>
        <button
          id="tab-eval-runs"
          onClick={() => setActiveTab("RUNS")}
          style={{
            padding: "8px 16px",
            borderRadius: "6px",
            border: "1px solid",
            borderColor: activeTab === "RUNS" ? "#2563eb" : "#e2e8f0",
            background: activeTab === "RUNS" ? "#eff6ff" : "#ffffff",
            color: activeTab === "RUNS" ? "#1d4ed8" : "#475569",
            fontWeight: "700",
            fontSize: "0.85rem",
            cursor: "pointer"
          }}
        >
          Execution Runs ({runs.length})
        </button>
      </div>

      {/* Tab 1: Eval Cases */}
      {activeTab === "CASES" && (
        <div style={{
          background: "#ffffff",
          border: "1px solid #e2e8f0",
          borderRadius: "12px",
          overflow: "hidden",
          boxShadow: "0 1px 3px rgba(0,0,0,0.04)"
        }}>
          {cases.length === 0 ? (
            <div className="emptyState" style={{ padding: "48px 16px" }}>
              <div className="emptyIcon">🧪</div>
              <div className="emptyTitle">No Evaluation Cases Configured</div>
              <div className="emptyMessage">
                Define an evaluation test case against a task contract to automatically test agent behavior.
              </div>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column" }}>
              {cases.map((evalCase, idx) => (
                <div
                  key={evalCase.id}
                  id={`eval-case-row-${evalCase.id}`}
                  style={{
                    padding: "18px 20px",
                    borderBottom: idx === cases.length - 1 ? "none" : "1px solid #f1f5f9",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    gap: "20px",
                    flexWrap: "wrap"
                  }}
                >
                  <div style={{ maxWidth: "600px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "4px" }}>
                      <strong style={{ fontSize: "0.95rem", color: "#0f172a" }}>{evalCase.name}</strong>
                      <span style={{
                        background: "#f1f5f9",
                        color: "#475569",
                        border: "1px solid #cbd5e1",
                        borderRadius: "4px",
                        padding: "1px 6px",
                        fontSize: "0.72rem",
                        fontFamily: "monospace"
                      }}>
                        Expected: {evalCase.expectedStatus}
                      </span>
                    </div>
                    <p style={{ margin: "0 0 6px", fontSize: "0.82rem", color: "#64748b" }}>
                      {evalCase.description || "Validates execution compliance and gate assertion rules."}
                    </p>
                    <div style={{ fontSize: "0.75rem", color: "#94a3b8", display: "flex", gap: "12px" }}>
                      <span>Contract ID: <code>{evalCase.taskContractId}</code></span>
                      <span>Created: {formatDate(evalCase.createdAt)}</span>
                    </div>
                  </div>

                  <div>
                    <button
                      id={`run-eval-case-${evalCase.id}`}
                      onClick={() => handleRunCase(evalCase.id, evalCase.name)}
                      disabled={runningCaseId === evalCase.id}
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "6px",
                        padding: "8px 16px",
                        background: "#2563eb",
                        color: "#ffffff",
                        border: "none",
                        borderRadius: "6px",
                        fontSize: "0.82rem",
                        fontWeight: "700",
                        cursor: runningCaseId === evalCase.id ? "wait" : "pointer",
                        boxShadow: "0 1px 3px rgba(37, 99, 235, 0.2)"
                      }}
                    >
                      {runningCaseId === evalCase.id ? "Executing Suite..." : "▶ Run Evaluation"}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Tab 2: Eval Runs */}
      {activeTab === "RUNS" && (
        <div style={{
          background: "#ffffff",
          border: "1px solid #e2e8f0",
          borderRadius: "12px",
          overflow: "hidden",
          boxShadow: "0 1px 3px rgba(0,0,0,0.04)"
        }}>
          {runs.length === 0 ? (
            <div className="emptyState" style={{ padding: "48px 16px" }}>
              <div className="emptyIcon">📊</div>
              <div className="emptyTitle">No Evaluation Runs Recorded</div>
              <div className="emptyMessage">
                Trigger an evaluation run from the Test Cases tab to generate automated safety scores.
              </div>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column" }}>
              {runs.map((run, idx) => (
                <div
                  key={run.id}
                  id={`eval-run-row-${run.id}`}
                  style={{
                    padding: "16px 20px",
                    borderBottom: idx === runs.length - 1 ? "none" : "1px solid #f1f5f9",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    gap: "16px",
                    flexWrap: "wrap"
                  }}
                >
                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "4px" }}>
                      <span className={`pill ${statusClass(run.status)}`}>
                        {run.status}
                      </span>
                      <strong style={{ fontSize: "0.92rem", color: "#0f172a" }}>
                        Run {run.id.slice(0, 12)}...
                      </strong>
                    </div>
                    <div style={{ fontSize: "0.78rem", color: "#64748b", display: "flex", gap: "14px" }}>
                      <span>Linked Execution: <code>{run.executionId}</code></span>
                      <span>Executed: {formatDate(run.createdAt)}</span>
                    </div>
                  </div>

                  <div style={{ display: "flex", alignItems: "center", gap: "20px" }}>
                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontSize: "0.72rem", color: "#64748b", textTransform: "uppercase" }}>Score</div>
                      <div style={{
                        fontSize: "1.1rem",
                        fontWeight: "800",
                        color: run.status === "PASSED" ? "#16a34a" : "#dc2626"
                      }}>
                        {formatPercent(run.score)}
                      </div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontSize: "0.72rem", color: "#64748b", textTransform: "uppercase" }}>Threshold</div>
                      <div style={{ fontSize: "0.9rem", fontWeight: "700", color: "#475569" }}>
                        {formatPercent(run.threshold)}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
