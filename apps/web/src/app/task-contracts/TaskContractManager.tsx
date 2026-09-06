"use client";

import { useState } from "react";
import type { TaskContractItem } from "../../lib/api";
import { createTaskContract } from "../../lib/api";

function formatDate(d: string | null) {
  if (!d) return "n/a";
  try {
    return new Date(d).toLocaleDateString();
  } catch {
    return d;
  }
}

export function TaskContractManager({
  initialContracts,
  initialError,
  orgName
}: {
  initialContracts: TaskContractItem[];
  initialError: string | null;
  orgName?: string;
}) {
  const [contracts, setContracts] = useState<TaskContractItem[]>(initialContracts);
  const [error, setError] = useState<string | null>(initialError);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedContract, setSelectedContract] = useState<TaskContractItem | null>(null);

  // Form state
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [version, setVersion] = useState(1);
  const [allowedToolsStr, setAllowedToolsStr] = useState("knowledge.search, git.read, file.read");
  const [requiredApprovalsStr, setRequiredApprovalsStr] = useState("external.publish");
  const [riskThreshold, setRiskThreshold] = useState(80);
  const [isCreating, setIsCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const handleCreateContract = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setCreateError("Contract name is required.");
      return;
    }

    const allowedTools = allowedToolsStr
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const requiredApprovals = requiredApprovalsStr
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

    setIsCreating(true);
    setCreateError(null);

    const result = await createTaskContract({
      name: name.trim(),
      description: description.trim() || undefined,
      version,
      allowedTools,
      requiredApprovals,
      riskThreshold
    });

    setIsCreating(false);

    if (result.error || !result.data) {
      setCreateError(result.error || "Failed to create task contract");
      return;
    }

    setContracts((prev) => [result.data!, ...prev]);
    setIsModalOpen(false);
    setName("");
    setDescription("");
    setVersion(1);
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
        <div style={{ maxWidth: "620px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "8px" }}>
            <h1 style={{ margin: 0, fontSize: "1.5rem", fontWeight: "800", color: "#0f172a" }}>
              Task Contracts
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
              Human Governance Invariant
            </span>
          </div>
          <p style={{ margin: 0, fontSize: "0.875rem", color: "#64748b", lineHeight: 1.5 }}>
            Task contracts establish the deterministic boundary constraints for agent executions: allowed integration tools, mandatory human sign-off gates, risk budgets, and schema assertions.
          </p>
        </div>

        <button
          id="open-create-contract-btn"
          onClick={() => {
            setCreateError(null);
            setIsModalOpen(true);
          }}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "8px",
            padding: "10px 18px",
            background: "#2563eb",
            color: "#ffffff",
            border: "none",
            borderRadius: "8px",
            fontSize: "0.875rem",
            fontWeight: "700",
            cursor: "pointer",
            boxShadow: "0 2px 6px rgba(37, 99, 235, 0.25)"
          }}
        >
          + Define Task Contract
        </button>
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
          <div style={{ fontWeight: "700", marginBottom: "4px" }}>Failed to Load Task Contracts</div>
          <div style={{ fontSize: "0.875rem" }}>{error}</div>
        </div>
      )}

      {/* Contract Cards Grid */}
      {contracts.length === 0 ? (
        <div className="card emptyState" style={{ padding: "48px 16px" }}>
          <div className="emptyIcon">📜</div>
          <div className="emptyTitle">No Task Contracts Defined</div>
          <div className="emptyMessage">
            Define a contract to bound what tools and operations your autonomous agents can invoke during an execution.
          </div>
          <button
            onClick={() => setIsModalOpen(true)}
            style={{
              marginTop: "16px",
              padding: "8px 16px",
              background: "#2563eb",
              color: "#ffffff",
              border: "none",
              borderRadius: "6px",
              fontSize: "0.82rem",
              fontWeight: "600",
              cursor: "pointer"
            }}
          >
            Create First Contract
          </button>
        </div>
      ) : (
        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(360px, 1fr))",
          gap: "20px"
        }}>
          {contracts.map((contract) => (
            <div
              key={contract.id}
              id={`task-contract-card-${contract.id}`}
              style={{
                background: "#ffffff",
                border: "1px solid #e2e8f0",
                borderRadius: "12px",
                padding: "20px",
                boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
                display: "flex",
                flexDirection: "column",
                justifyContent: "space-between",
                gap: "16px"
              }}
            >
              <div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "8px" }}>
                  <div>
                    <h3 style={{ margin: 0, fontSize: "1.05rem", fontWeight: "700", color: "#0f172a" }}>
                      {contract.name}
                    </h3>
                    <span style={{ fontSize: "0.75rem", color: "#94a3b8" }}>
                      Created {formatDate(contract.createdAt)}
                    </span>
                  </div>
                  <span style={{
                    background: "#f1f5f9",
                    color: "#334155",
                    border: "1px solid #cbd5e1",
                    borderRadius: "6px",
                    padding: "2px 8px",
                    fontSize: "0.75rem",
                    fontWeight: "800",
                    fontFamily: "monospace"
                  }}>
                    v{contract.version}
                  </span>
                </div>

                <p style={{
                  margin: "0 0 16px",
                  fontSize: "0.85rem",
                  color: "#64748b",
                  minHeight: "36px",
                  lineHeight: 1.4
                }}>
                  {contract.description || "No description provided."}
                </p>

                {/* Permitted Tools */}
                <div style={{ marginBottom: "12px" }}>
                  <div style={{ fontSize: "0.72rem", fontWeight: "700", color: "#64748b", textTransform: "uppercase", marginBottom: "6px" }}>
                    Permitted Tools ({contract.allowedTools.length})
                  </div>
                  <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
                    {contract.allowedTools.length === 0 ? (
                      <span style={{ fontSize: "0.75rem", color: "#94a3b8", fontStyle: "italic" }}>No tools permitted</span>
                    ) : (
                      contract.allowedTools.map((t) => (
                        <span
                          key={t}
                          style={{
                            background: "#f8fafc",
                            border: "1px solid #cbd5e1",
                            color: "#334155",
                            padding: "2px 6px",
                            borderRadius: "4px",
                            fontSize: "0.72rem",
                            fontWeight: "600",
                            fontFamily: "monospace"
                          }}
                        >
                          {t}
                        </span>
                      ))
                    )}
                  </div>
                </div>

                {/* Mandatory Approval Gates */}
                <div style={{ marginBottom: "12px" }}>
                  <div style={{ fontSize: "0.72rem", fontWeight: "700", color: "#991b1b", textTransform: "uppercase", marginBottom: "6px" }}>
                    Mandatory Approvals ({contract.requiredApprovals.length})
                  </div>
                  <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
                    {contract.requiredApprovals.length === 0 ? (
                      <span style={{ fontSize: "0.75rem", color: "#94a3b8", fontStyle: "italic" }}>None (automatic)</span>
                    ) : (
                      contract.requiredApprovals.map((a) => (
                        <span
                          key={a}
                          style={{
                            background: "#fef2f2",
                            border: "1px solid #fecaca",
                            color: "#b91c1c",
                            padding: "2px 6px",
                            borderRadius: "4px",
                            fontSize: "0.72rem",
                            fontWeight: "700",
                            fontFamily: "monospace"
                          }}
                        >
                          🔒 {a}
                        </span>
                      ))
                    )}
                  </div>
                </div>

                {/* Risk Budget */}
                <div style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  background: "#f8fafc",
                  borderRadius: "6px",
                  padding: "6px 10px",
                  fontSize: "0.8rem",
                  color: "#475569"
                }}>
                  <span>Max Risk Budget:</span>
                  <strong style={{ color: contract.riskThreshold > 80 ? "#dc2626" : "#2563eb" }}>
                    {contract.riskThreshold} / 100
                  </strong>
                </div>
              </div>

              {/* Card Footer */}
              <div style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                paddingTop: "12px",
                borderTop: "1px solid #f1f5f9"
              }}>
                <span style={{
                  fontSize: "0.75rem",
                  fontWeight: "700",
                  color: contract.isActive ? "#16a34a" : "#94a3b8"
                }}>
                  {contract.isActive ? "● Active Spec" : "○ Inactive"}
                </span>

                <button
                  id={`inspect-spec-${contract.id}`}
                  onClick={() => setSelectedContract(contract)}
                  style={{
                    padding: "4px 10px",
                    background: "#f1f5f9",
                    color: "#334155",
                    border: "none",
                    borderRadius: "6px",
                    fontSize: "0.75rem",
                    fontWeight: "600",
                    cursor: "pointer"
                  }}
                >
                  Inspect Spec &rarr;
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Contract Detail Modal */}
      {selectedContract && (
        <div className="modalOverlay" role="dialog" aria-modal="true">
          <div className="modalCard" style={{ maxWidth: "600px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
              <div>
                <h2 style={{ margin: 0, fontSize: "1.15rem", fontWeight: "800", color: "#0f172a" }}>
                  {selectedContract.name} (v{selectedContract.version})
                </h2>
                <span style={{ fontSize: "0.75rem", color: "#64748b" }}>ID: {selectedContract.id}</span>
              </div>
              <button
                onClick={() => setSelectedContract(null)}
                style={{ background: "transparent", border: "none", fontSize: "1.2rem", cursor: "pointer", color: "#64748b" }}
              >
                ✕
              </button>
            </div>

            <div style={{ marginBottom: "16px" }}>
              <strong style={{ fontSize: "0.82rem", color: "#334155", display: "block", marginBottom: "6px" }}>
                Input &amp; Output Schema Assertions
              </strong>
              <div style={{
                background: "#0f172a",
                color: "#e2e8f0",
                borderRadius: "8px",
                padding: "12px",
                fontFamily: "monospace",
                fontSize: "0.78rem",
                maxHeight: "220px",
                overflowY: "auto"
              }}>
                <pre style={{ margin: 0, whiteSpace: "pre-wrap" }}>
                  {JSON.stringify(
                    {
                      inputSchema: selectedContract.inputSchema,
                      outputSchema: selectedContract.outputSchema
                    },
                    null,
                    2
                  )}
                </pre>
              </div>
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <button
                onClick={() => setSelectedContract(null)}
                style={{
                  padding: "8px 16px",
                  background: "#2563eb",
                  color: "#ffffff",
                  border: "none",
                  borderRadius: "6px",
                  fontWeight: "600",
                  fontSize: "0.85rem",
                  cursor: "pointer"
                }}
              >
                Close Spec
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Create Contract Modal */}
      {isModalOpen && (
        <div className="modalOverlay" role="dialog" aria-modal="true">
          <div className="modalCard" style={{ maxWidth: "560px" }}>
            <form onSubmit={handleCreateContract}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
                <h2 style={{ margin: 0, fontSize: "1.2rem", fontWeight: "800", color: "#0f172a" }}>
                  Define New Task Contract
                </h2>
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  style={{ background: "transparent", border: "none", fontSize: "1.2rem", cursor: "pointer", color: "#64748b" }}
                >
                  ✕
                </button>
              </div>

              {createError && (
                <div style={{
                  background: "#fef2f2",
                  border: "1px solid #fca5a5",
                  borderRadius: "6px",
                  padding: "10px 14px",
                  color: "#991b1b",
                  fontSize: "0.85rem",
                  marginBottom: "16px"
                }}>
                  {createError}
                </div>
              )}

              <div style={{ display: "grid", gridTemplateColumns: "1fr 90px", gap: "12px", marginBottom: "14px" }}>
                <div>
                  <label htmlFor="contract-name-input" style={{ display: "block", fontSize: "0.82rem", fontWeight: "700", color: "#334155", marginBottom: "4px" }}>
                    Contract Name <span style={{ color: "#ef4444" }}>*</span>
                  </label>
                  <input
                    id="contract-name-input"
                    type="text"
                    required
                    placeholder="e.g. Customer Onboarding Workflow"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    style={{
                      width: "100%",
                      padding: "8px 12px",
                      fontSize: "0.85rem",
                      borderRadius: "6px",
                      border: "1px solid #cbd5e1",
                      outline: "none"
                    }}
                  />
                </div>
                <div>
                  <label htmlFor="contract-version-input" style={{ display: "block", fontSize: "0.82rem", fontWeight: "700", color: "#334155", marginBottom: "4px" }}>
                    Version
                  </label>
                  <input
                    id="contract-version-input"
                    type="number"
                    min={1}
                    value={version}
                    onChange={(e) => setVersion(parseInt(e.target.value, 10) || 1)}
                    style={{
                      width: "100%",
                      padding: "8px 12px",
                      fontSize: "0.85rem",
                      borderRadius: "6px",
                      border: "1px solid #cbd5e1",
                      outline: "none"
                    }}
                  />
                </div>
              </div>

              <div style={{ marginBottom: "14px" }}>
                <label htmlFor="contract-desc-input" style={{ display: "block", fontSize: "0.82rem", fontWeight: "700", color: "#334155", marginBottom: "4px" }}>
                  Description
                </label>
                <input
                  id="contract-desc-input"
                  type="text"
                  placeholder="Summary of agent responsibilities and constraints"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "8px 12px",
                    fontSize: "0.85rem",
                    borderRadius: "6px",
                    border: "1px solid #cbd5e1",
                    outline: "none"
                  }}
                />
              </div>

              <div style={{ marginBottom: "14px" }}>
                <label htmlFor="allowed-tools-input" style={{ display: "block", fontSize: "0.82rem", fontWeight: "700", color: "#334155", marginBottom: "4px" }}>
                  Allowed Integration Tools (comma-separated)
                </label>
                <input
                  id="allowed-tools-input"
                  type="text"
                  value={allowedToolsStr}
                  onChange={(e) => setAllowedToolsStr(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "8px 12px",
                    fontSize: "0.85rem",
                    fontFamily: "monospace",
                    borderRadius: "6px",
                    border: "1px solid #cbd5e1",
                    outline: "none"
                  }}
                />
              </div>

              <div style={{ marginBottom: "14px" }}>
                <label htmlFor="required-approvals-input" style={{ display: "block", fontSize: "0.82rem", fontWeight: "700", color: "#334155", marginBottom: "4px" }}>
                  Required Approval Capabilities (comma-separated)
                </label>
                <input
                  id="required-approvals-input"
                  type="text"
                  value={requiredApprovalsStr}
                  onChange={(e) => setRequiredApprovalsStr(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "8px 12px",
                    fontSize: "0.85rem",
                    fontFamily: "monospace",
                    borderRadius: "6px",
                    border: "1px solid #cbd5e1",
                    outline: "none"
                  }}
                />
              </div>

              <div style={{ marginBottom: "20px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px" }}>
                  <label htmlFor="risk-slider" style={{ fontSize: "0.82rem", fontWeight: "700", color: "#334155" }}>
                    Maximum Allowed Risk Budget
                  </label>
                  <span style={{ fontSize: "0.82rem", fontWeight: "800", color: "#2563eb" }}>{riskThreshold}/100</span>
                </div>
                <input
                  id="risk-slider"
                  type="range"
                  min={1}
                  max={100}
                  value={riskThreshold}
                  onChange={(e) => setRiskThreshold(parseInt(e.target.value, 10))}
                  style={{ width: "100%" }}
                />
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px" }}>
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  style={{
                    padding: "8px 16px",
                    background: "#f1f5f9",
                    color: "#334155",
                    border: "none",
                    borderRadius: "6px",
                    fontWeight: "600",
                    fontSize: "0.85rem",
                    cursor: "pointer"
                  }}
                >
                  Cancel
                </button>
                <button
                  id="submit-create-contract-btn"
                  type="submit"
                  disabled={isCreating}
                  style={{
                    padding: "8px 18px",
                    background: "#2563eb",
                    color: "#ffffff",
                    border: "none",
                    borderRadius: "6px",
                    fontWeight: "700",
                    fontSize: "0.85rem",
                    cursor: isCreating ? "wait" : "pointer"
                  }}
                >
                  {isCreating ? "Saving Spec..." : "Create Task Contract"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
