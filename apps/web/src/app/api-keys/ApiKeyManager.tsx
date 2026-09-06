"use client";

import { useState } from "react";
import type { ApiKeyItem, CreatedApiKeyResponse } from "../../lib/api";
import { createApiKey, revokeApiKey } from "../../lib/api";

// NOTE: The "all" / "admin" wildcard scopes are intentionally excluded from this list.
// Per the Human Governance Invariant, API keys are scoped to agent-facing routes only.
// Admin actions (feature flags, approval gate policy, API key management) require a
// human session (Owner or Admin role) and cannot be performed by any API key,
// regardless of scopes. Adding wildcard scopes in the UI would be misleading.
const AVAILABLE_SCOPES = [
  { scope: "executions:read", label: "Executions (Read)", desc: "View execution history and runtime status" },
  { scope: "executions:write", label: "Executions (Write)", desc: "Dispatch and trigger new agent executions" },
  { scope: "contracts:read", label: "Contracts (Read)", desc: "Inspect task contract definitions and safety constraints" },
  { scope: "governance:read", label: "Governance (Read)", desc: "Query approval gate rules and feature flag states" },
  { scope: "traces:read", label: "Traces (Read)", desc: "Inspect step-by-step tool execution traces" },
  { scope: "traces:write", label: "Traces (Write)", desc: "Log step traces and execution events" },
  { scope: "tool_calls:check", label: "Tool Calls (Check)", desc: "Validate tool calls against approval gate policy" },
  { scope: "tool_calls:result", label: "Tool Calls (Result)", desc: "Report tool execution outcomes to the runtime" },
  { scope: "eval:read", label: "Evals (Read)", desc: "View evaluation benchmark cases and regression metrics" },
  { scope: "eval:write", label: "Evals (Write)", desc: "Trigger and score evaluation test suites" },
  { scope: "observability:read", label: "Observability (Read)", desc: "Access telemetry and dashboard analytics" },
  { scope: "audit:read", label: "Audit (Read)", desc: "Inspect immutable audit log records" }
];

function formatDate(d: string | null) {
  if (!d) return "Never";
  try {
    return new Date(d).toLocaleString();
  } catch {
    return d;
  }
}

export function ApiKeyManager({
  initialKeys,
  initialError,
  orgName
}: {
  initialKeys: ApiKeyItem[];
  initialError: string | null;
  orgName?: string;
}) {
  const [keys, setKeys] = useState<ApiKeyItem[]>(initialKeys);
  const [error, setError] = useState<string | null>(initialError);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [newKeyName, setNewKeyName] = useState("");
  const [selectedScopes, setSelectedScopes] = useState<string[]>([
    "executions:read",
    "executions:write",
    "tool_calls:check",
    "tool_calls:result"
  ]);
  const [isCreating, setIsCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [newlyCreatedKey, setNewlyCreatedKey] = useState<CreatedApiKeyResponse | null>(null);
  const [copied, setCopied] = useState(false);
  const [revokingId, setRevokingId] = useState<string | null>(null);

  const toggleScope = (scope: string) => {
    setSelectedScopes((prev) =>
      prev.includes(scope) ? prev.filter((s) => s !== scope) : [...prev, scope]
    );
  };

  const handleSelectAll = () => {
    setSelectedScopes(AVAILABLE_SCOPES.map((s) => s.scope));
  };

  const handleSelectAgentDefaults = () => {
    setSelectedScopes([
      "executions:read",
      "executions:write",
      "tool_calls:check",
      "tool_calls:result",
      "traces:write",
      "contracts:read"
    ]);
  };

  const handleCreateKey = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newKeyName.trim()) {
      setCreateError("Key name is required.");
      return;
    }
    if (selectedScopes.length === 0) {
      setCreateError("Select at least one scope.");
      return;
    }

    setIsCreating(true);
    setCreateError(null);

    const result = await createApiKey({
      name: newKeyName.trim(),
      scopes: selectedScopes
    });

    setIsCreating(false);

    if (result.error || !result.data) {
      setCreateError(result.error || "Failed to create API key");
      return;
    }

    setNewlyCreatedKey(result.data);
    setKeys((prev) => [result.data!.apiKeyRecord, ...prev]);
    setNewKeyName("");
  };

  const handleRevoke = async (id: string, name: string) => {
    if (!confirm(`Are you sure you want to revoke API key "${name}"? Any agent using this key will immediately be rejected.`)) {
      return;
    }

    setRevokingId(id);
    const result = await revokeApiKey(id);
    setRevokingId(null);

    if (result.error) {
      alert(`Error revoking API key: ${result.error}`);
      return;
    }

    setKeys((prev) =>
      prev.map((k) => (k.id === id ? { ...k, revokedAt: new Date().toISOString() } : k))
    );
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 3000);
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
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "8px" }}>
            <h1 style={{ margin: 0, fontSize: "1.5rem", fontWeight: "800", color: "#0f172a" }}>
              API Keys Management
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
              Session (Owner/Admin) Only
            </span>
          </div>
          <p style={{ margin: 0, fontSize: "0.875rem", color: "#64748b", lineHeight: 1.5, maxWidth: "600px" }}>
            Provision scoped bearer credentials for autonomous agent runtimes, execution workers, and integration pipelines. Human session roles and API key scopes are strictly segregated.
          </p>
        </div>

        <button
          id="open-create-key-modal-btn"
          onClick={() => {
            setNewlyCreatedKey(null);
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
          + Create New API Key
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
          <div style={{ fontWeight: "700", marginBottom: "4px" }}>Failed to Load API Keys</div>
          <div style={{ fontSize: "0.875rem" }}>{error}</div>
        </div>
      )}

      {/* Keys Table Container */}
      <div style={{
        background: "#ffffff",
        border: "1px solid #e2e8f0",
        borderRadius: "12px",
        overflow: "hidden",
        boxShadow: "0 1px 3px rgba(0,0,0,0.04)"
      }}>
        <div style={{
          padding: "16px 20px",
          borderBottom: "1px solid #e2e8f0",
          background: "#f8fafc",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center"
        }}>
          <span style={{ fontSize: "0.85rem", fontWeight: "700", color: "#334155" }}>
            Active &amp; Historical API Credentials ({keys.length})
          </span>
          <span style={{ fontSize: "0.78rem", color: "#64748b" }}>
            Tenant: <strong>{orgName || "Active Organization"}</strong>
          </span>
        </div>

        {keys.length === 0 ? (
          <div className="emptyState" style={{ padding: "48px 16px" }}>
            <div className="emptyIcon">🔑</div>
            <div className="emptyTitle">No API Keys Generated</div>
            <div className="emptyMessage">
              Generate an API key to allow machine agents and external pipelines to call the governance endpoints.
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
              Generate First Key
            </button>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column" }}>
            {keys.map((key, idx) => {
              const isRevoked = !!key.revokedAt;

              return (
                <div
                  key={key.id}
                  id={`api-key-row-${key.id}`}
                  style={{
                    padding: "18px 20px",
                    borderBottom: idx === keys.length - 1 ? "none" : "1px solid #f1f5f9",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "flex-start",
                    gap: "20px",
                    flexWrap: "wrap",
                    background: isRevoked ? "#fafafa" : "#ffffff",
                    opacity: isRevoked ? 0.75 : 1
                  }}
                >
                  <div style={{ display: "flex", flexDirection: "column", gap: "6px", maxWidth: "650px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
                      <strong style={{ fontSize: "0.95rem", color: "#0f172a" }}>{key.name}</strong>
                      <code style={{
                        background: "#f1f5f9",
                        color: "#334155",
                        padding: "2px 8px",
                        borderRadius: "4px",
                        fontSize: "0.82rem",
                        fontFamily: "monospace"
                      }}>
                        {key.keyPrefix}••••••••
                      </code>
                      {isRevoked ? (
                        <span style={{
                          background: "#fee2e2",
                          color: "#991b1b",
                          border: "1px solid #fca5a5",
                          borderRadius: "999px",
                          padding: "2px 8px",
                          fontSize: "0.72rem",
                          fontWeight: "700"
                        }}>
                          REVOKED ({formatDate(key.revokedAt)})
                        </span>
                      ) : (
                        <span style={{
                          background: "#f0fdf4",
                          color: "#166534",
                          border: "1px solid #bbf7d0",
                          borderRadius: "999px",
                          padding: "2px 8px",
                          fontSize: "0.72rem",
                          fontWeight: "700"
                        }}>
                          ACTIVE
                        </span>
                      )}
                    </div>

                    {/* Scopes Badges */}
                    <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", marginTop: "4px" }}>
                      {key.scopes.map((scope) => (
                        <span
                          key={scope}
                          style={{
                            background: "#f8fafc",
                            border: "1px solid #cbd5e1",
                            color: "#475569",
                            padding: "2px 6px",
                            borderRadius: "4px",
                            fontSize: "0.72rem",
                            fontWeight: "600",
                            fontFamily: "monospace"
                          }}
                        >
                          {scope}
                        </span>
                      ))}
                    </div>

                    <div style={{ fontSize: "0.78rem", color: "#94a3b8", display: "flex", gap: "16px", marginTop: "4px" }}>
                      <span>Created: {formatDate(key.createdAt)}</span>
                      <span>Last Used: {formatDate(key.lastUsedAt)}</span>
                    </div>
                  </div>

                  {/* Actions */}
                  <div>
                    {!isRevoked && (
                      <button
                        id={`revoke-key-${key.id}`}
                        onClick={() => handleRevoke(key.id, key.name)}
                        disabled={revokingId === key.id}
                        style={{
                          padding: "6px 14px",
                          background: "#ffffff",
                          color: "#dc2626",
                          border: "1px solid #fca5a5",
                          borderRadius: "6px",
                          fontSize: "0.8rem",
                          fontWeight: "600",
                          cursor: revokingId === key.id ? "wait" : "pointer",
                          transition: "all 0.15s ease"
                        }}
                      >
                        {revokingId === key.id ? "Revoking..." : "Revoke Key"}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Create Key Modal */}
      {isModalOpen && (
        <div className="modalOverlay" role="dialog" aria-modal="true">
          <div className="modalCard" style={{ maxWidth: "620px", maxHeight: "90vh", overflowY: "auto" }}>
            {!newlyCreatedKey ? (
              <form onSubmit={handleCreateKey}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
                  <h2 style={{ margin: 0, fontSize: "1.2rem", fontWeight: "800", color: "#0f172a" }}>
                    Create Machine API Key
                  </h2>
                  <button
                    type="button"
                    onClick={() => setIsModalOpen(false)}
                    style={{ background: "transparent", border: "none", fontSize: "1.2rem", cursor: "pointer", color: "#64748b" }}
                  >
                    ✕
                  </button>
                </div>

                <p style={{ margin: "0 0 16px", fontSize: "0.85rem", color: "#64748b", lineHeight: 1.4 }}>
                  API keys are assigned machine identity (<code>role: AGENT</code>). Select the exact scopes required for this agent runtime.
                </p>

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

                <div style={{ marginBottom: "18px" }}>
                  <label htmlFor="key-name-input" style={{ display: "block", fontSize: "0.82rem", fontWeight: "700", color: "#334155", marginBottom: "6px" }}>
                    Key Name / Agent Label <span style={{ color: "#ef4444" }}>*</span>
                  </label>
                  <input
                    id="key-name-input"
                    type="text"
                    required
                    placeholder="e.g. CI Agent Runner / Production Sync Worker"
                    value={newKeyName}
                    onChange={(e) => setNewKeyName(e.target.value)}
                    style={{
                      width: "100%",
                      padding: "9px 12px",
                      fontSize: "0.875rem",
                      borderRadius: "6px",
                      border: "1px solid #cbd5e1",
                      outline: "none"
                    }}
                  />
                </div>

                {/* Scopes Section */}
                <div style={{ marginBottom: "20px" }}>
                  {/* Governance policy notice */}
                  <div style={{
                    background: "#fefce8",
                    border: "1px solid #fde68a",
                    borderRadius: "8px",
                    padding: "10px 14px",
                    marginBottom: "12px",
                    fontSize: "0.78rem",
                    color: "#92400e",
                    lineHeight: 1.5
                  }}>
                    <strong>⚠ Human Governance Constraint:</strong> API keys are restricted to agent-facing routes.
                    Admin actions — feature flags, approval gate policy, and key management — require a human
                    session (Owner/Admin role) and will be rejected regardless of the scopes granted here.
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
                    <label style={{ fontSize: "0.82rem", fontWeight: "700", color: "#334155" }}>
                      Granted Scopes ({selectedScopes.length} selected)
                    </label>
                    <div style={{ display: "flex", gap: "8px" }}>
                      <button
                        type="button"
                        onClick={handleSelectAgentDefaults}
                        style={{ background: "transparent", border: "none", color: "#2563eb", fontSize: "0.75rem", fontWeight: "600", cursor: "pointer" }}
                      >
                        Agent Standard
                      </button>
                      <button
                        type="button"
                        onClick={handleSelectAll}
                        style={{ background: "transparent", border: "none", color: "#2563eb", fontSize: "0.75rem", fontWeight: "600", cursor: "pointer" }}
                      >
                        Select All
                      </button>
                    </div>
                  </div>

                  <div style={{
                    maxHeight: "280px",
                    overflowY: "auto",
                    border: "1px solid #e2e8f0",
                    borderRadius: "8px",
                    padding: "8px 12px",
                    background: "#f8fafc"
                  }}>
                    {AVAILABLE_SCOPES.map(({ scope, label, desc }) => {
                      const isChecked = selectedScopes.includes(scope);
                      return (
                        <label
                          key={scope}
                          style={{
                            display: "flex",
                            alignItems: "flex-start",
                            gap: "10px",
                            padding: "8px 6px",
                            borderBottom: "1px solid #f1f5f9",
                            cursor: "pointer",
                            fontSize: "0.82rem"
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => toggleScope(scope)}
                            style={{ marginTop: "3px" }}
                          />
                          <div>
                            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                              <strong style={{ color: "#0f172a" }}>{label}</strong>
                              <code style={{ fontSize: "0.72rem", background: "#e2e8f0", padding: "1px 5px", borderRadius: "3px" }}>
                                {scope}
                              </code>
                            </div>
                            <div style={{ color: "#64748b", fontSize: "0.75rem", marginTop: "2px" }}>
                              {desc}
                            </div>
                          </div>
                        </label>
                      );
                    })}
                  </div>
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
                    type="submit"
                    id="submit-create-key-btn"
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
                    {isCreating ? "Generating Key..." : "Generate Secret Key"}
                  </button>
                </div>
              </form>
            ) : (
              /* High-Visibility Raw Key Display */
              <div>
                <div style={{ textAlign: "center", marginBottom: "16px" }}>
                  <div style={{ fontSize: "2rem", marginBottom: "8px" }}>🎉</div>
                  <h2 style={{ margin: "0 0 6px", fontSize: "1.25rem", fontWeight: "800", color: "#0f172a" }}>
                    API Key Created Successfully
                  </h2>
                  <p style={{ margin: 0, fontSize: "0.85rem", color: "#64748b" }}>
                    Copy this key immediately. For security reasons, it will <strong>never be shown again</strong>.
                  </p>
                </div>

                <div style={{
                  background: "#0f172a",
                  border: "1px solid #334155",
                  borderRadius: "8px",
                  padding: "16px",
                  marginBottom: "16px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: "12px"
                }}>
                  <code style={{
                    color: "#38bdf8",
                    fontSize: "0.9rem",
                    fontFamily: "monospace",
                    wordBreak: "break-all"
                  }}>
                    {newlyCreatedKey.rawKey}
                  </code>
                  <button
                    id="copy-secret-key-btn"
                    onClick={() => copyToClipboard(newlyCreatedKey.rawKey)}
                    style={{
                      flex: "0 0 auto",
                      padding: "6px 12px",
                      background: copied ? "#16a34a" : "#2563eb",
                      color: "#ffffff",
                      border: "none",
                      borderRadius: "6px",
                      fontSize: "0.8rem",
                      fontWeight: "700",
                      cursor: "pointer",
                      transition: "background 0.15s ease"
                    }}
                  >
                    {copied ? "✓ Copied!" : "Copy Key"}
                  </button>
                </div>

                <div style={{
                  background: "#fefce8",
                  border: "1px solid #fef08a",
                  borderRadius: "8px",
                  padding: "12px 16px",
                  marginBottom: "20px",
                  color: "#854d0e",
                  fontSize: "0.82rem",
                  lineHeight: 1.4
                }}>
                  ⚠️ <strong>Security Notice:</strong> Store this key in an environment variable (e.g. <code>AGENTREADY_API_KEY</code>). It will only be able to execute actions permitted by the granted scopes.
                </div>

                <div style={{ display: "flex", justifyContent: "flex-end" }}>
                  <button
                    onClick={() => {
                      setNewlyCreatedKey(null);
                      setIsModalOpen(false);
                    }}
                    style={{
                      padding: "8px 20px",
                      background: "#0f172a",
                      color: "#ffffff",
                      border: "none",
                      borderRadius: "6px",
                      fontWeight: "700",
                      fontSize: "0.85rem",
                      cursor: "pointer"
                    }}
                  >
                    I Have Saved My Secret Key
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
