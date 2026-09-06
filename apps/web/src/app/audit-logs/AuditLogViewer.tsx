"use client";

import { useState, useMemo } from "react";
import type { AuditLogItem } from "../../lib/api";

function formatDate(d: string | null) {
  if (!d) return "n/a";
  try {
    return new Date(d).toLocaleString();
  } catch {
    return d;
  }
}

function timeAgo(d: string) {
  const diffMs = Date.now() - new Date(d).getTime();
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export function AuditLogViewer({
  initialLogs,
  initialError,
  orgName
}: {
  initialLogs: AuditLogItem[];
  initialError: string | null;
  orgName?: string;
}) {
  const [logs, setLogs] = useState<AuditLogItem[]>(initialLogs);
  const [error, setError] = useState<string | null>(initialError);
  const [loading, setLoading] = useState(false);
  const [filterActor, setFilterActor] = useState<"ALL" | "USER" | "AGENT" | "SYSTEM">("ALL");
  const [searchTerm, setSearchTerm] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const refreshLogs = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/v1/audit-logs?limit=100", {
        credentials: "include",
        cache: "no-store"
      });
      if (!res.ok) {
        throw new Error(`API returned HTTP ${res.status}: ${res.statusText}`);
      }
      const data = await res.json();
      setLogs(data);
    } catch (err: any) {
      setError(err?.message || "Failed to reload audit logs");
    } finally {
      setLoading(false);
    }
  };

  const filteredLogs = useMemo(() => {
    return logs.filter((log) => {
      if (filterActor !== "ALL" && log.actorType !== filterActor) {
        return false;
      }
      if (!searchTerm) return true;
      const term = searchTerm.toLowerCase();
      const actionMatch = log.action.toLowerCase().includes(term);
      const targetMatch = log.targetType.toLowerCase().includes(term) || (log.targetId && log.targetId.toLowerCase().includes(term));
      const userMatch = log.actorUser && (
        (log.actorUser.name && log.actorUser.name.toLowerCase().includes(term)) ||
        log.actorUser.email.toLowerCase().includes(term)
      );
      const agentMatch = log.actorAgent && log.actorAgent.name.toLowerCase().includes(term);
      return actionMatch || targetMatch || userMatch || agentMatch;
    });
  }, [logs, filterActor, searchTerm]);

  const actorStats = useMemo(() => {
    let userCount = 0;
    let agentCount = 0;
    let systemCount = 0;
    for (const log of logs) {
      if (log.actorType === "USER") userCount++;
      else if (log.actorType === "AGENT") agentCount++;
      else if (log.actorType === "SYSTEM") systemCount++;
    }
    return { userCount, agentCount, systemCount, total: logs.length };
  }, [logs]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
      {/* Header & Ledger Status Card */}
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
        <div style={{ maxWidth: "600px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "8px" }}>
            <h1 style={{ margin: 0, fontSize: "1.5rem", fontWeight: "800", color: "#0f172a" }}>
              Audit Logs
            </h1>
            <span style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "6px",
              background: "#f0fdf4",
              color: "#166534",
              border: "1px solid #bbf7d0",
              borderRadius: "999px",
              padding: "2px 10px",
              fontSize: "0.75rem",
              fontWeight: "700"
            }}>
              <span style={{ width: "6px", height: "6px", borderRadius: "50%", background: "#22c55e" }}></span>
              Immutable Ledger Enforced
            </span>
          </div>
          <p style={{ margin: 0, fontSize: "0.875rem", color: "#64748b", lineHeight: 1.5 }}>
            Cryptographically sealed timeline of all governance events, authentication changes, approval reviews, and execution dispatches. All records are protected by database triggers revoking UPDATE and DELETE permissions.
          </p>
        </div>

        <div style={{
          display: "flex",
          gap: "16px",
          alignItems: "center"
        }}>
          <button
            id="refresh-audit-logs-btn"
            onClick={refreshLogs}
            disabled={loading}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "8px",
              padding: "8px 16px",
              fontSize: "0.85rem",
              fontWeight: "600",
              color: "#334155",
              background: "#f8fafc",
              border: "1px solid #cbd5e1",
              borderRadius: "8px",
              cursor: loading ? "wait" : "pointer"
            }}
          >
            {loading ? "Refreshing..." : "↻ Refresh Ledger"}
          </button>
        </div>
      </div>

      {/* Error state if backend disconnected */}
      {error && (
        <div style={{
          background: "#fef2f2",
          border: "1px solid #fca5a5",
          borderRadius: "8px",
          padding: "16px 20px",
          color: "#991b1b"
        }}>
          <div style={{ fontWeight: "700", marginBottom: "4px" }}>Failed to Load Audit Trail</div>
          <div style={{ fontSize: "0.875rem" }}>{error}</div>
          <button
            onClick={refreshLogs}
            style={{
              marginTop: "12px",
              padding: "6px 12px",
              background: "#b91c1c",
              color: "#ffffff",
              border: "none",
              borderRadius: "6px",
              fontSize: "0.82rem",
              fontWeight: "600",
              cursor: "pointer"
            }}
          >
            Retry Connection
          </button>
        </div>
      )}

      {/* Metric Cards Row */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
        gap: "16px"
      }}>
        <div style={{ background: "#ffffff", border: "1px solid #e2e8f0", borderRadius: "10px", padding: "16px" }}>
          <div style={{ fontSize: "0.75rem", fontWeight: "700", color: "#64748b", textTransform: "uppercase" }}>Total Events</div>
          <div style={{ fontSize: "1.6rem", fontWeight: "800", color: "#0f172a", marginTop: "4px" }}>{actorStats.total}</div>
          <div style={{ fontSize: "0.75rem", color: "#94a3b8", marginTop: "2px" }}>Recent 100 entries</div>
        </div>
        <div style={{ background: "#ffffff", border: "1px solid #e2e8f0", borderRadius: "10px", padding: "16px" }}>
          <div style={{ fontSize: "0.75rem", fontWeight: "700", color: "#2563eb", textTransform: "uppercase" }}>Human Actions</div>
          <div style={{ fontSize: "1.6rem", fontWeight: "800", color: "#1d4ed8", marginTop: "4px" }}>{actorStats.userCount}</div>
          <div style={{ fontSize: "0.75rem", color: "#94a3b8", marginTop: "2px" }}>Operator sessions</div>
        </div>
        <div style={{ background: "#ffffff", border: "1px solid #e2e8f0", borderRadius: "10px", padding: "16px" }}>
          <div style={{ fontSize: "0.75rem", fontWeight: "700", color: "#7c3aed", textTransform: "uppercase" }}>Agent Actions</div>
          <div style={{ fontSize: "1.6rem", fontWeight: "800", color: "#6d28d9", marginTop: "4px" }}>{actorStats.agentCount}</div>
          <div style={{ fontSize: "0.75rem", color: "#94a3b8", marginTop: "2px" }}>Autonomous identity</div>
        </div>
        <div style={{ background: "#ffffff", border: "1px solid #e2e8f0", borderRadius: "10px", padding: "16px" }}>
          <div style={{ fontSize: "0.75rem", fontWeight: "700", color: "#475569", textTransform: "uppercase" }}>System Engine</div>
          <div style={{ fontSize: "1.6rem", fontWeight: "800", color: "#334155", marginTop: "4px" }}>{actorStats.systemCount}</div>
          <div style={{ fontSize: "0.75rem", color: "#94a3b8", marginTop: "2px" }}>Workers & gates</div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        gap: "16px",
        flexWrap: "wrap",
        background: "#ffffff",
        border: "1px solid #e2e8f0",
        borderRadius: "10px",
        padding: "14px 18px"
      }}>
        <div style={{ display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" }}>
          <span style={{ fontSize: "0.82rem", fontWeight: "700", color: "#64748b", marginRight: "4px" }}>Actor:</span>
          {(["ALL", "USER", "AGENT", "SYSTEM"] as const).map((type) => (
            <button
              key={type}
              id={`filter-actor-${type.toLowerCase()}`}
              onClick={() => setFilterActor(type)}
              style={{
                padding: "6px 12px",
                fontSize: "0.8rem",
                fontWeight: "700",
                borderRadius: "6px",
                border: "1px solid",
                borderColor: filterActor === type ? "#2563eb" : "#e2e8f0",
                background: filterActor === type ? "#eff6ff" : "#ffffff",
                color: filterActor === type ? "#1d4ed8" : "#475569",
                cursor: "pointer",
                transition: "all 0.15s ease"
              }}
            >
              {type === "ALL" ? "All Actors" : type === "USER" ? "Human Users" : type === "AGENT" ? "Agents" : "System"}
            </button>
          ))}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <input
            id="audit-search-input"
            type="text"
            placeholder="Search action, target, actor..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={{
              padding: "7px 12px",
              fontSize: "0.85rem",
              borderRadius: "6px",
              border: "1px solid #cbd5e1",
              minWidth: "240px",
              outline: "none"
            }}
          />
          {searchTerm && (
            <button
              onClick={() => setSearchTerm("")}
              style={{
                background: "transparent",
                border: "none",
                color: "#94a3b8",
                cursor: "pointer",
                fontSize: "0.85rem"
              }}
            >
              Clear
            </button>
          )}
        </div>
      </div>

      {/* Audit Log Entries List */}
      <div style={{
        background: "#ffffff",
        border: "1px solid #e2e8f0",
        borderRadius: "12px",
        overflow: "hidden",
        boxShadow: "0 1px 3px rgba(0,0,0,0.04)"
      }}>
        {filteredLogs.length === 0 ? (
          <div className="emptyState" style={{ padding: "48px 16px" }}>
            <div className="emptyIcon">📋</div>
            <div className="emptyTitle">No Audit Records Found</div>
            <div className="emptyMessage">
              {searchTerm || filterActor !== "ALL"
                ? "No audit events match your active filters."
                : "No governance actions have been recorded yet."}
            </div>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column" }}>
            {filteredLogs.map((log, idx) => {
              const isExpanded = expandedId === log.id;
              const hasMetadata = log.metadata && Object.keys(log.metadata).length > 0;

              return (
                <div
                  key={log.id}
                  id={`audit-log-item-${log.id}`}
                  style={{
                    borderBottom: idx === filteredLogs.length - 1 ? "none" : "1px solid #f1f5f9",
                    padding: "16px 20px",
                    background: isExpanded ? "#f8fafc" : "#ffffff",
                    transition: "background 0.15s ease"
                  }}
                >
                  <div style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    gap: "16px",
                    flexWrap: "wrap"
                  }}>
                    {/* Left Details */}
                    <div style={{ display: "flex", alignItems: "center", gap: "14px", flexWrap: "wrap" }}>
                      {/* Actor Pill */}
                      {log.actorType === "USER" && (
                        <span style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "5px",
                          background: "#eff6ff",
                          color: "#1d4ed8",
                          border: "1px solid #bfdbfe",
                          borderRadius: "999px",
                          padding: "3px 10px",
                          fontSize: "0.75rem",
                          fontWeight: "700"
                        }}>
                          👤 User: {log.actorUser?.name || log.actorUser?.email || log.actorUserId || "Human"}
                        </span>
                      )}
                      {log.actorType === "AGENT" && (
                        <span style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "5px",
                          background: "#f5f3ff",
                          color: "#6d28d9",
                          border: "1px solid #ddd6fe",
                          borderRadius: "999px",
                          padding: "3px 10px",
                          fontSize: "0.75rem",
                          fontWeight: "700"
                        }}>
                          🤖 Agent: {log.actorAgent?.name || log.actorAgentId || "Autonomous Agent"}
                        </span>
                      )}
                      {log.actorType === "SYSTEM" && (
                        <span style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "5px",
                          background: "#f8fafc",
                          color: "#475569",
                          border: "1px solid #cbd5e1",
                          borderRadius: "999px",
                          padding: "3px 10px",
                          fontSize: "0.75rem",
                          fontWeight: "700"
                        }}>
                          ⚙️ System
                        </span>
                      )}

                      {/* Action Name */}
                      <code style={{
                        background: "#0f172a",
                        color: "#f8fafc",
                        padding: "3px 8px",
                        borderRadius: "5px",
                        fontSize: "0.82rem",
                        fontWeight: "700",
                        letterSpacing: "-0.2px"
                      }}>
                        {log.action}
                      </code>

                      {/* Target Pill */}
                      <span style={{
                        color: "#64748b",
                        fontSize: "0.82rem",
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "6px"
                      }}>
                        <span style={{ fontWeight: "600", color: "#334155" }}>{log.targetType}</span>
                        {log.targetId && (
                          <span style={{
                            fontFamily: "monospace",
                            background: "#f1f5f9",
                            padding: "2px 6px",
                            borderRadius: "4px",
                            fontSize: "0.78rem"
                          }}>
                            {log.targetId}
                          </span>
                        )}
                      </span>
                    </div>

                    {/* Right Timestamp & Toggle */}
                    <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
                      <span
                        title={formatDate(log.createdAt)}
                        style={{ fontSize: "0.8rem", color: "#94a3b8" }}
                      >
                        {timeAgo(log.createdAt)}
                      </span>

                      {hasMetadata && (
                        <button
                          id={`toggle-metadata-${log.id}`}
                          onClick={() => setExpandedId(isExpanded ? null : log.id)}
                          style={{
                            background: isExpanded ? "#e2e8f0" : "#f1f5f9",
                            color: "#334155",
                            border: "none",
                            borderRadius: "6px",
                            padding: "4px 10px",
                            fontSize: "0.75rem",
                            fontWeight: "700",
                            cursor: "pointer",
                            transition: "all 0.15s ease"
                          }}
                        >
                          {isExpanded ? "Hide Details ▲" : "View Details ▼"}
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Expanded Metadata Viewer */}
                  {isExpanded && hasMetadata && (
                    <div style={{
                      marginTop: "14px",
                      padding: "14px 16px",
                      background: "#0f172a",
                      color: "#e2e8f0",
                      borderRadius: "8px",
                      fontFamily: "monospace",
                      fontSize: "0.8rem",
                      overflowX: "auto"
                    }}>
                      <div style={{
                        display: "flex",
                        justifyContent: "space-between",
                        marginBottom: "8px",
                        borderBottom: "1px solid #334155",
                        paddingBottom: "6px",
                        fontSize: "0.72rem",
                        color: "#94a3b8"
                      }}>
                        <span>EVENT PAYLOAD &amp; STATE DIFF</span>
                        <span>RECORD ID: {log.id}</span>
                      </div>
                      <pre style={{ margin: 0, whiteSpace: "pre-wrap" }}>
                        {JSON.stringify(log.metadata, null, 2)}
                      </pre>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
