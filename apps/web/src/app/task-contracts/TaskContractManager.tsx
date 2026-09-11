"use client";

import { useState } from "react";
import type { ExpectedStep, TaskContractItem, TrajectoryMode, TrajectoryPolicy } from "../../lib/api";
import { createTaskContract, patchTaskContract } from "../../lib/api";

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

  // Form state for Contract Creation
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [version, setVersion] = useState(1);
  const [allowedToolsStr, setAllowedToolsStr] = useState("knowledge.search, git.read, file.read");
  const [requiredApprovalsStr, setRequiredApprovalsStr] = useState("external.publish");
  const [riskThreshold, setRiskThreshold] = useState(80);
  const [isCreating, setIsCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  // Creation state for Trajectory Policy
  const [includeTrajectoryPolicy, setIncludeTrajectoryPolicy] = useState(false);
  const [createPolicyMode, setCreatePolicyMode] = useState<TrajectoryMode>("STRICT_SEQUENCE");
  const [createPolicyForbidden, setCreatePolicyForbidden] = useState("");
  const [createPolicyMaxCalls, setCreatePolicyMaxCalls] = useState<number | "">("");
  const [createPolicySteps, setCreatePolicySteps] = useState<
    Array<{ tool: string; required: boolean; expectedGateStatus?: "AUTOMATIC" | "REQUIRE_APPROVAL" | "BLOCKED" }>
  >([
    { tool: "knowledge.search", required: true },
    { tool: "external.publish", required: true, expectedGateStatus: "REQUIRE_APPROVAL" }
  ]);

  // Inspection / Edit Policy state
  const [isEditingPolicy, setIsEditingPolicy] = useState(false);
  const [editMode, setEditMode] = useState<TrajectoryMode>("STRICT_SEQUENCE");
  const [editForbidden, setEditForbidden] = useState("");
  const [editMaxCalls, setEditMaxCalls] = useState<number | "">("");
  const [editSteps, setEditSteps] = useState<
    Array<{ tool: string; required: boolean; expectedGateStatus?: "AUTOMATIC" | "REQUIRE_APPROVAL" | "BLOCKED" }>
  >([]);
  const [isSavingPolicy, setIsSavingPolicy] = useState(false);
  const [savePolicyError, setSavePolicyError] = useState<string | null>(null);

  const openInspectModal = (contract: TaskContractItem) => {
    setSelectedContract(contract);
    setIsEditingPolicy(false);
    setSavePolicyError(null);
    if (contract.trajectoryPolicy) {
      setEditMode(contract.trajectoryPolicy.mode || "STRICT_SEQUENCE");
      setEditForbidden((contract.trajectoryPolicy.forbiddenTools || []).join(", "));
      setEditMaxCalls(contract.trajectoryPolicy.maxToolCalls ?? "");
      setEditSteps(
        (contract.trajectoryPolicy.expectedSteps || []).map((s) => ({
          tool: s.tool,
          required: s.required !== false,
          expectedGateStatus: s.expectedGateStatus
        }))
      );
    } else {
      setEditMode("STRICT_SEQUENCE");
      setEditForbidden("");
      setEditMaxCalls("");
      setEditSteps([
        { tool: contract.allowedTools[0] || "get_transaction", required: true }
      ]);
    }
  };

  const handleSavePolicy = async () => {
    if (!selectedContract) return;

    if (editSteps.length === 0) {
      setSavePolicyError("At least one expected step is required in a trajectory policy.");
      return;
    }

    const forbiddenTools = editForbidden
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

    const policy: TrajectoryPolicy = {
      mode: editMode,
      expectedSteps: editSteps.map((s) => ({
        tool: s.tool.trim(),
        required: s.required,
        expectedGateStatus: s.expectedGateStatus || undefined
      })),
      forbiddenTools,
      maxToolCalls: typeof editMaxCalls === "number" && editMaxCalls > 0 ? editMaxCalls : undefined
    };

    setIsSavingPolicy(true);
    setSavePolicyError(null);

    const result = await patchTaskContract(selectedContract.id, { trajectoryPolicy: policy });
    setIsSavingPolicy(false);

    if (result.error || !result.data) {
      setSavePolicyError(result.error || "Failed to update trajectory policy");
      return;
    }

    setSelectedContract(result.data);
    setContracts((prev) => prev.map((c) => (c.id === result.data!.id ? result.data! : c)));
    setIsEditingPolicy(false);
  };

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

    let trajectoryPolicy: TrajectoryPolicy | undefined = undefined;
    if (includeTrajectoryPolicy && createPolicySteps.length > 0) {
      trajectoryPolicy = {
        mode: createPolicyMode,
        expectedSteps: createPolicySteps.map((s) => ({
          tool: s.tool.trim(),
          required: s.required,
          expectedGateStatus: s.expectedGateStatus || undefined
        })),
        forbiddenTools: createPolicyForbidden.split(",").map((s) => s.trim()).filter(Boolean),
        maxToolCalls: typeof createPolicyMaxCalls === "number" && createPolicyMaxCalls > 0 ? createPolicyMaxCalls : undefined
      };
    }

    setIsCreating(true);
    setCreateError(null);

    const result = await createTaskContract({
      name: name.trim(),
      description: description.trim() || undefined,
      version,
      allowedTools,
      requiredApprovals,
      riskThreshold,
      trajectoryPolicy
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
    setIncludeTrajectoryPolicy(false);
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

                {/* Trajectory Policy Badge */}
                <div style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  background: contract.trajectoryPolicy ? "#f0fdf4" : "#f8fafc",
                  border: `1px solid ${contract.trajectoryPolicy ? "#bbf7d0" : "#e2e8f0"}`,
                  borderRadius: "6px",
                  padding: "6px 10px",
                  fontSize: "0.8rem",
                  color: contract.trajectoryPolicy ? "#166534" : "#64748b",
                  marginTop: "8px"
                }}>
                  <span>Trajectory Policy:</span>
                  <strong style={{ fontFamily: "monospace", fontSize: "0.75rem" }}>
                    {contract.trajectoryPolicy ? `⚡ ${contract.trajectoryPolicy.mode || "STRICT_SEQUENCE"}` : "○ None"}
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
                  onClick={() => openInspectModal(contract)}
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
          <div className="modalCard" style={{ maxWidth: "680px", maxHeight: "90vh", overflowY: "auto" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
              <div>
                <h2 style={{ margin: 0, fontSize: "1.2rem", fontWeight: "800", color: "#0f172a" }}>
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

            {/* Trajectory Policy Section */}
            <div style={{
              background: "#ffffff",
              border: "1px solid #e2e8f0",
              borderRadius: "8px",
              padding: "16px",
              marginBottom: "16px"
            }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <span style={{ fontSize: "1rem" }}>⚡</span>
                  <strong style={{ fontSize: "0.9rem", color: "#0f172a" }}>Deterministic Trajectory Policy</strong>
                </div>
                {!isEditingPolicy && (
                  <button
                    id="toggle-edit-trajectory-btn"
                    type="button"
                    onClick={() => setIsEditingPolicy(true)}
                    style={{
                      padding: "4px 10px",
                      background: "#eff6ff",
                      border: "1px solid #bfdbfe",
                      color: "#1d4ed8",
                      borderRadius: "6px",
                      fontSize: "0.78rem",
                      fontWeight: "700",
                      cursor: "pointer"
                    }}
                  >
                    {selectedContract.trajectoryPolicy ? "Edit Policy" : "+ Add Policy"}
                  </button>
                )}
              </div>

              {savePolicyError && (
                <div style={{
                  background: "#fef2f2",
                  border: "1px solid #fca5a5",
                  borderRadius: "6px",
                  padding: "8px 12px",
                  color: "#991b1b",
                  fontSize: "0.8rem",
                  marginBottom: "12px"
                }}>
                  {savePolicyError}
                </div>
              )}

              {!isEditingPolicy ? (
                // Read-Only Policy View
                selectedContract.trajectoryPolicy ? (
                  <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                    <div style={{ display: "flex", gap: "12px", alignItems: "center", flexWrap: "wrap" }}>
                      <span style={{
                        background: "#dbeafe",
                        color: "#1e40af",
                        padding: "2px 8px",
                        borderRadius: "4px",
                        fontSize: "0.75rem",
                        fontWeight: "800",
                        fontFamily: "monospace"
                      }}>
                        MODE: {selectedContract.trajectoryPolicy.mode || "STRICT_SEQUENCE"}
                      </span>
                      {selectedContract.trajectoryPolicy.maxToolCalls && (
                        <span style={{ fontSize: "0.78rem", color: "#475569" }}>
                          Max tool calls: <strong>{selectedContract.trajectoryPolicy.maxToolCalls}</strong>
                        </span>
                      )}
                    </div>

                    {selectedContract.trajectoryPolicy.forbiddenTools && selectedContract.trajectoryPolicy.forbiddenTools.length > 0 && (
                      <div style={{ fontSize: "0.78rem", color: "#64748b" }}>
                        <span style={{ fontWeight: "700", color: "#b91c1c" }}>Forbidden tools: </span>
                        {selectedContract.trajectoryPolicy.forbiddenTools.map((tool) => (
                          <span
                            key={tool}
                            style={{
                              background: "#fee2e2",
                              color: "#991b1b",
                              padding: "1px 6px",
                              borderRadius: "3px",
                              fontSize: "0.72rem",
                              fontFamily: "monospace",
                              marginRight: "4px"
                            }}
                          >
                            ✕ {tool}
                          </span>
                        ))}
                      </div>
                    )}

                    <div>
                      <div style={{ fontSize: "0.75rem", fontWeight: "700", color: "#334155", marginBottom: "4px" }}>
                        Expected Tool Sequence ({selectedContract.trajectoryPolicy.expectedSteps?.length || 0} steps):
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                        {(selectedContract.trajectoryPolicy.expectedSteps || []).map((step, idx) => (
                          <div
                            key={idx}
                            style={{
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "space-between",
                              background: "#f8fafc",
                              border: "1px solid #e2e8f0",
                              borderRadius: "4px",
                              padding: "6px 10px",
                              fontSize: "0.78rem"
                            }}
                          >
                            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                              <span style={{ fontWeight: "800", color: "#64748b" }}>#{idx + 1}</span>
                              <code style={{ color: "#0f172a", fontWeight: "700" }}>{step.tool}</code>
                              {step.required !== false && (
                                <span style={{ background: "#dcfce7", color: "#166534", fontSize: "0.7rem", padding: "1px 5px", borderRadius: "3px", fontWeight: "700" }}>
                                  Required
                                </span>
                              )}
                            </div>
                            {step.expectedGateStatus && (
                              <span style={{
                                background: step.expectedGateStatus === "REQUIRE_APPROVAL" ? "#fef3c7" : "#f1f5f9",
                                color: step.expectedGateStatus === "REQUIRE_APPROVAL" ? "#92400e" : "#475569",
                                fontSize: "0.7rem",
                                padding: "2px 6px",
                                borderRadius: "4px",
                                fontWeight: "700",
                                fontFamily: "monospace"
                              }}>
                                🔒 {step.expectedGateStatus}
                              </span>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div style={{ color: "#64748b", fontSize: "0.82rem", fontStyle: "italic" }}>
                    No deterministic trajectory policy configured. Tool calls may execute in any unconstrained order.
                  </div>
                )
              ) : (
                // Interactive Policy Editor
                <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
                    <div>
                      <label style={{ display: "block", fontSize: "0.78rem", fontWeight: "700", color: "#334155", marginBottom: "4px" }}>
                        Enforcement Mode
                      </label>
                      <select
                        id="policy-mode-select"
                        value={editMode}
                        onChange={(e) => setEditMode(e.target.value as TrajectoryMode)}
                        style={{ width: "100%", padding: "6px 8px", fontSize: "0.82rem", borderRadius: "4px", border: "1px solid #cbd5e1" }}
                      >
                        <option value="STRICT_SEQUENCE">STRICT_SEQUENCE (Exact sequential order)</option>
                        <option value="SUBSEQUENCE">SUBSEQUENCE (In order, extras tolerated)</option>
                        <option value="UNORDERED">UNORDERED (Any order)</option>
                      </select>
                    </div>
                    <div>
                      <label style={{ display: "block", fontSize: "0.78rem", fontWeight: "700", color: "#334155", marginBottom: "4px" }}>
                        Max Tool Calls Limit
                      </label>
                      <input
                        id="policy-max-calls-input"
                        type="number"
                        min={1}
                        placeholder="e.g. 5 (optional)"
                        value={editMaxCalls}
                        onChange={(e) => setEditMaxCalls(e.target.value ? parseInt(e.target.value, 10) : "")}
                        style={{ width: "100%", padding: "6px 8px", fontSize: "0.82rem", borderRadius: "4px", border: "1px solid #cbd5e1" }}
                      />
                    </div>
                  </div>

                  <div>
                    <label style={{ display: "block", fontSize: "0.78rem", fontWeight: "700", color: "#334155", marginBottom: "4px" }}>
                      Forbidden Tools (comma-separated)
                    </label>
                    <input
                      id="policy-forbidden-input"
                      type="text"
                      placeholder="e.g. delete_account, drop_database"
                      value={editForbidden}
                      onChange={(e) => setEditForbidden(e.target.value)}
                      style={{ width: "100%", padding: "6px 8px", fontSize: "0.82rem", fontFamily: "monospace", borderRadius: "4px", border: "1px solid #cbd5e1" }}
                    />
                  </div>

                  <div>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
                      <label style={{ fontSize: "0.78rem", fontWeight: "700", color: "#334155" }}>
                        Expected Steps Sequence ({editSteps.length})
                      </label>
                      <button
                        type="button"
                        onClick={() => setEditSteps((prev) => [...prev, { tool: "", required: true }])}
                        style={{
                          padding: "2px 8px",
                          background: "#f1f5f9",
                          border: "1px solid #cbd5e1",
                          borderRadius: "4px",
                          fontSize: "0.72rem",
                          fontWeight: "700",
                          cursor: "pointer"
                        }}
                      >
                        + Add Step
                      </button>
                    </div>

                    <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                      {editSteps.map((step, idx) => (
                        <div
                          key={idx}
                          style={{
                            display: "grid",
                            gridTemplateColumns: "30px 1fr 90px 140px 30px",
                            gap: "6px",
                            alignItems: "center",
                            background: "#f8fafc",
                            padding: "6px",
                            borderRadius: "4px",
                            border: "1px solid #e2e8f0"
                          }}
                        >
                          <span style={{ fontSize: "0.75rem", fontWeight: "800", color: "#64748b", textAlign: "center" }}>#{idx + 1}</span>
                          <input
                            type="text"
                            required
                            placeholder="tool_name"
                            value={step.tool}
                            onChange={(e) => {
                              const val = e.target.value;
                              setEditSteps((prev) => prev.map((s, i) => (i === idx ? { ...s, tool: val } : s)));
                            }}
                            style={{ padding: "4px 8px", fontSize: "0.78rem", fontFamily: "monospace", borderRadius: "4px", border: "1px solid #cbd5e1" }}
                          />
                          <label style={{ display: "flex", alignItems: "center", gap: "4px", fontSize: "0.72rem", color: "#334155", cursor: "pointer" }}>
                            <input
                              type="checkbox"
                              checked={step.required !== false}
                              onChange={(e) => {
                                const checked = e.target.checked;
                                setEditSteps((prev) => prev.map((s, i) => (i === idx ? { ...s, required: checked } : s)));
                              }}
                            />
                            Required
                          </label>
                          <select
                            value={step.expectedGateStatus || ""}
                            onChange={(e) => {
                              const val = e.target.value as "AUTOMATIC" | "REQUIRE_APPROVAL" | "BLOCKED" | "";
                              setEditSteps((prev) => prev.map((s, i) => (i === idx ? { ...s, expectedGateStatus: val || undefined } : s)));
                            }}
                            style={{ padding: "4px 6px", fontSize: "0.72rem", borderRadius: "4px", border: "1px solid #cbd5e1" }}
                          >
                            <option value="">No Gate Gate Status</option>
                            <option value="AUTOMATIC">AUTOMATIC</option>
                            <option value="REQUIRE_APPROVAL">REQUIRE_APPROVAL</option>
                            <option value="BLOCKED">BLOCKED</option>
                          </select>
                          <button
                            type="button"
                            onClick={() => setEditSteps((prev) => prev.filter((_, i) => i !== idx))}
                            style={{ background: "transparent", border: "none", color: "#ef4444", fontSize: "0.9rem", cursor: "pointer" }}
                          >
                            ✕
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px", marginTop: "4px" }}>
                    <button
                      type="button"
                      onClick={() => setIsEditingPolicy(false)}
                      style={{ padding: "6px 12px", background: "#f1f5f9", border: "none", borderRadius: "4px", fontSize: "0.78rem", fontWeight: "600", cursor: "pointer" }}
                    >
                      Cancel
                    </button>
                    <button
                      id="save-trajectory-policy-btn"
                      type="button"
                      disabled={isSavingPolicy}
                      onClick={handleSavePolicy}
                      style={{
                        padding: "6px 14px",
                        background: "#2563eb",
                        color: "#ffffff",
                        border: "none",
                        borderRadius: "4px",
                        fontSize: "0.78rem",
                        fontWeight: "700",
                        cursor: isSavingPolicy ? "wait" : "pointer"
                      }}
                    >
                      {isSavingPolicy ? "Saving Policy..." : "Save Trajectory Policy"}
                    </button>
                  </div>
                </div>
              )}
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
                maxHeight: "160px",
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
          <div className="modalCard" style={{ maxWidth: "600px", maxHeight: "90vh", overflowY: "auto" }}>
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

              <div style={{ marginBottom: "16px" }}>
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

              {/* Collapsible Trajectory Policy Section */}
              <div style={{
                background: "#f8fafc",
                border: "1px solid #e2e8f0",
                borderRadius: "6px",
                padding: "12px",
                marginBottom: "20px"
              }}>
                <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "0.82rem", fontWeight: "700", color: "#0f172a", cursor: "pointer" }}>
                  <input
                    id="toggle-include-trajectory-cb"
                    type="checkbox"
                    checked={includeTrajectoryPolicy}
                    onChange={(e) => setIncludeTrajectoryPolicy(e.target.checked)}
                  />
                  <span>⚡ Include Deterministic Trajectory Policy</span>
                </label>

                {includeTrajectoryPolicy && (
                  <div style={{ marginTop: "12px", display: "flex", flexDirection: "column", gap: "10px" }}>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
                      <div>
                        <label style={{ display: "block", fontSize: "0.75rem", fontWeight: "700", color: "#475569", marginBottom: "4px" }}>
                          Mode
                        </label>
                        <select
                          value={createPolicyMode}
                          onChange={(e) => setCreatePolicyMode(e.target.value as TrajectoryMode)}
                          style={{ width: "100%", padding: "6px", fontSize: "0.8rem", borderRadius: "4px", border: "1px solid #cbd5e1" }}
                        >
                          <option value="STRICT_SEQUENCE">STRICT_SEQUENCE</option>
                          <option value="SUBSEQUENCE">SUBSEQUENCE</option>
                          <option value="UNORDERED">UNORDERED</option>
                        </select>
                      </div>
                      <div>
                        <label style={{ display: "block", fontSize: "0.75rem", fontWeight: "700", color: "#475569", marginBottom: "4px" }}>
                          Max Tool Calls
                        </label>
                        <input
                          type="number"
                          min={1}
                          placeholder="e.g. 5"
                          value={createPolicyMaxCalls}
                          onChange={(e) => setCreatePolicyMaxCalls(e.target.value ? parseInt(e.target.value, 10) : "")}
                          style={{ width: "100%", padding: "6px", fontSize: "0.8rem", borderRadius: "4px", border: "1px solid #cbd5e1" }}
                        />
                      </div>
                    </div>

                    <div>
                      <label style={{ display: "block", fontSize: "0.75rem", fontWeight: "700", color: "#475569", marginBottom: "4px" }}>
                        Forbidden Tools (comma-separated)
                      </label>
                      <input
                        type="text"
                        placeholder="e.g. delete_customer, drop_table"
                        value={createPolicyForbidden}
                        onChange={(e) => setCreatePolicyForbidden(e.target.value)}
                        style={{ width: "100%", padding: "6px", fontSize: "0.8rem", fontFamily: "monospace", borderRadius: "4px", border: "1px solid #cbd5e1" }}
                      />
                    </div>
                  </div>
                )}
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
