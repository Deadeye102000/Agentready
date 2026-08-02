"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Navbar } from "../../components/Navbar";
import {
  type ApprovalRequest,
  fallbackApprovalRequests,
  reviewApprovalRequest
} from "../../lib/api";

// ─── Small Helpers ────────────────────────────────────────────────────────────

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

function safePayloadPreview(payload: any): string {
  if (!payload) return "No input data";
  try {
    const str = JSON.stringify(payload, null, 2);
    // Strip long text blobs (content fields etc.)
    const cleaned = JSON.parse(str);
    for (const k of Object.keys(cleaned)) {
      if (typeof cleaned[k] === "string" && cleaned[k].length > 80) {
        cleaned[k] = cleaned[k].slice(0, 80) + "…";
      }
    }
    return JSON.stringify(cleaned, null, 2);
  } catch {
    return String(payload);
  }
}

function riskPillClass(level: string | null) {
  const l = (level || "").toUpperCase();
  if (l === "CRITICAL") return "pill bad";
  if (l === "HIGH") return "pill warn";
  return "pill";
}

// ─── Rejection Modal ──────────────────────────────────────────────────────────

function RejectModal({
  requestId,
  toolName,
  onCancel,
  onConfirm,
}: {
  requestId: string;
  toolName: string;
  onCancel: () => void;
  onConfirm: (note: string) => void;
}) {
  const [note, setNote] = useState("");
  const [err, setErr] = useState("");
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  function handleSubmit() {
    const trimmed = note.trim();
    if (!trimmed) {
      setErr("Please provide a reason for rejection (required).");
      return;
    }
    onConfirm(trimmed);
  }

  return (
    <div className="modalOverlay" role="dialog" aria-modal="true" aria-labelledby="modal-title">
      <div className="modalCard">
        <h2 id="modal-title" style={{ fontSize: "1.1rem", fontWeight: "800", marginBottom: "6px" }}>
          Reject Action
        </h2>
        <p style={{ fontSize: "0.875rem", color: "#64748b", marginBottom: "16px" }}>
          You are rejecting: <strong>{toolName}</strong>
          <br />
          The linked execution will be marked as <strong>FAILED</strong> and this decision will be recorded in audit logs.
        </p>

        <label htmlFor="rejection-note" style={{ fontSize: "0.82rem", fontWeight: "600", color: "#334155", display: "block", marginBottom: "6px" }}>
          Rejection reason <span style={{ color: "#ef4444" }}>*</span>
        </label>
        <textarea
          id="rejection-note"
          ref={inputRef}
          value={note}
          onChange={(e) => { setNote(e.target.value); setErr(""); }}
          placeholder="e.g. Schema change not approved by DBA team — requires separate ticket."
          rows={3}
          style={{
            width: "100%",
            border: err ? "1.5px solid #ef4444" : "1.5px solid #cbd5e1",
            borderRadius: "8px",
            padding: "10px 12px",
            fontSize: "0.875rem",
            color: "#0f172a",
            resize: "vertical",
            outline: "none",
            background: "#fff"
          }}
        />
        {err && <p style={{ color: "#ef4444", fontSize: "0.78rem", marginTop: "4px" }}>{err}</p>}

        <div style={{ display: "flex", gap: "10px", justifyContent: "flex-end", marginTop: "16px" }}>
          <button className="retryBtn" onClick={onCancel}>
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            style={{
              border: "none",
              background: "#ef4444",
              color: "#fff",
              borderRadius: "6px",
              padding: "8px 18px",
              fontWeight: "700",
              fontSize: "0.875rem",
              cursor: "pointer"
            }}
          >
            Confirm Rejection
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Approval Card ────────────────────────────────────────────────────────────

function ApprovalCard({
  request,
  onDecision,
}: {
  request: ApprovalRequest;
  onDecision: (id: string, status: "APPROVED" | "REJECTED", note?: string) => Promise<void>;
}) {
  const [working, setWorking] = useState(false);
  const [showReject, setShowReject] = useState(false);
  const [localStatus, setLocalStatus] = useState(request.status);
  const [actionError, setActionError] = useState<string | null>(null);

  const isDecided = localStatus !== "PENDING";

  async function handleApprove() {
    setWorking(true);
    setActionError(null);
    await onDecision(request.id, "APPROVED");
    setLocalStatus("APPROVED");
    setWorking(false);
  }

  async function handleReject(note: string) {
    setShowReject(false);
    setWorking(true);
    setActionError(null);
    await onDecision(request.id, "REJECTED", note);
    setLocalStatus("REJECTED");
    setWorking(false);
  }

  const payloadToShow = { ...request.payload };
  delete payloadToShow.executionId; // avoid leaking internal IDs in payload preview

  return (
    <>
      {showReject && (
        <RejectModal
          requestId={request.id}
          toolName={request.requestedAction}
          onCancel={() => setShowReject(false)}
          onConfirm={handleReject}
        />
      )}

      <article
        className="approvalCard"
        style={{
          borderLeft: `5px solid ${
            localStatus === "APPROVED" ? "#10b981" :
            localStatus === "REJECTED" ? "#ef4444" :
            (request.riskLevel || "").toUpperCase() === "CRITICAL" ? "#ef4444" : "#eab308"
          }`
        }}
      >
        {/* Header row */}
        <div className="approvalCardHeader">
          <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
            <span className="brandBadge" style={{ fontFamily: "monospace", fontSize: "0.82rem" }}>
              {request.requestedAction}
            </span>
            {request.riskLevel && (
              <span className={riskPillClass(request.riskLevel)}>
                {request.riskLevel} RISK
              </span>
            )}
            <span
              className={`pill ${localStatus === "APPROVED" ? "good" : localStatus === "REJECTED" ? "bad" : "warn"}`}
            >
              {localStatus}
            </span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "12px", color: "#64748b", fontSize: "0.82rem" }}>
            <span>by <strong>{request.agent?.name ?? "Unknown Agent"}</strong></span>
            <span title={formatDate(request.createdAt)}>{timeAgo(request.createdAt)}</span>
          </div>
        </div>

        {/* Reason */}
        {request.reason && (
          <div className="approvalReason">
            <span className="muted" style={{ fontWeight: "600", fontSize: "0.75rem", textTransform: "uppercase", display: "block", marginBottom: "4px" }}>
              Why approval is required
            </span>
            {request.reason}
          </div>
        )}

        {/* Input payload summary */}
        <div style={{ marginBottom: "12px" }}>
          <span className="muted" style={{ fontWeight: "600", fontSize: "0.75rem", textTransform: "uppercase", display: "block", marginBottom: "4px" }}>
            Input Summary
          </span>
          <pre className="payloadPre">{safePayloadPreview(payloadToShow)}</pre>
        </div>

        {/* Execution link */}
        {request.executionId && (
          <div style={{ marginBottom: "12px" }}>
            <span className="muted" style={{ fontWeight: "600", fontSize: "0.75rem", textTransform: "uppercase", display: "block", marginBottom: "4px" }}>
              Linked Execution
            </span>
            <Link
              href={`/executions/${request.executionId}`}
              style={{ fontSize: "0.875rem", color: "#2563eb", textDecoration: "none", fontWeight: "600" }}
            >
              View execution → {request.executionId}
            </Link>
          </div>
        )}

        {/* Action error */}
        {actionError && (
          <div className="errorBanner" style={{ marginBottom: "12px", padding: "10px 14px" }}>
            <div className="errorIcon" style={{ width: "20px", height: "20px", fontSize: "0.7rem" }}>!</div>
            <div className="errorText">
              <strong>Action failed</strong>
              <span>{actionError}</span>
            </div>
          </div>
        )}

        {/* Action buttons */}
        {!isDecided ? (
          <div style={{ display: "flex", gap: "10px", paddingTop: "4px" }}>
            <button
              id={`approve-${request.id}`}
              disabled={working}
              onClick={handleApprove}
              className="approveBtn"
            >
              {working ? "Processing…" : "✓ Approve"}
            </button>
            <button
              id={`reject-${request.id}`}
              disabled={working}
              onClick={() => setShowReject(true)}
              className="rejectBtn"
            >
              ✕ Reject
            </button>
          </div>
        ) : (
          <div style={{ fontSize: "0.875rem", color: "#64748b" }}>
            Decision recorded: <strong style={{ color: localStatus === "APPROVED" ? "#10b981" : "#ef4444" }}>{localStatus}</strong>
            {request.reviewedAt && <span> at {formatDate(request.reviewedAt)}</span>}
          </div>
        )}
      </article>
    </>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function ApprovalQueuePage() {
  const [requests, setRequests] = useState<ApprovalRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [apiError, setApiError] = useState<string | null>(null);
  const [isFallback, setIsFallback] = useState(false);
  const [filter, setFilter] = useState<"PENDING" | "ALL">("PENDING");

  async function load(showAll: boolean) {
    setLoading(true);
    setApiError(null);

    const base = process.env.NEXT_PUBLIC_AGENTREADY_API_URL || "http://localhost:3001";
    const url = showAll
      ? `${base}/api/v1/approval-requests`
      : `${base}/api/v1/approval-requests?status=PENDING`;

    try {
      const res = await fetch(url, { cache: "no-store" });
      if (!res.ok) {
        setRequests(fallbackApprovalRequests);
        setIsFallback(true);
        setApiError(`API returned HTTP ${res.status}: ${res.statusText}`);
      } else {
        const data = await res.json() as ApprovalRequest[];
        setRequests(data);
        setIsFallback(false);
      }
    } catch (err: any) {
      setRequests(fallbackApprovalRequests);
      setIsFallback(true);
      setApiError(err?.message || "Failed to connect to AgentReady API server");
    }

    setLoading(false);
  }

  useEffect(() => {
    load(filter === "ALL");
  }, [filter]);

  async function handleDecision(id: string, status: "APPROVED" | "REJECTED", note?: string) {
    const result = await reviewApprovalRequest(id, status, note);
    if (!result.ok) {
      // Surface error on the card itself via state; card handles it
      console.error("Review failed:", result.error);
    }
  }

  const pendingCount = requests.filter((r) => r.status === "PENDING").length;

  return (
    <>
      <Navbar orgName="Approval Queue" />
      <main className="shell">
        {/* Page header */}
        <div className="topbar" style={{ paddingBottom: "20px", borderBottom: "1px solid #e2e8f0", marginBottom: "20px" }}>
          <div>
            <p className="brandBadge" style={{ marginBottom: "4px" }}>Human Review Required</p>
            <h1 style={{ fontSize: "2rem", fontWeight: "800" }}>Approval Queue</h1>
            <p className="muted" style={{ marginTop: "4px" }}>
              Risky agent actions paused and waiting for human sign-off before continuing.
            </p>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            {pendingCount > 0 && (
              <span className="pill warn" style={{ fontSize: "0.9rem", padding: "6px 14px" }}>
                {pendingCount} pending
              </span>
            )}
            <button
              onClick={() => load(filter === "ALL")}
              className="retryBtn"
              disabled={loading}
            >
              {loading ? "Loading…" : "↻ Refresh"}
            </button>
          </div>
        </div>

        {/* Error banner */}
        {isFallback && apiError && (
          <div className="errorBanner" style={{ marginBottom: "20px" }} role="alert">
            <div className="errorContent">
              <div className="errorIcon">!</div>
              <div className="errorText">
                <strong>API Connection Alert</strong>
                <span>{apiError} — Showing demo fallback data.</span>
              </div>
            </div>
          </div>
        )}

        {/* Filter tabs */}
        <div style={{ display: "flex", gap: "8px", marginBottom: "20px" }}>
          <button
            onClick={() => setFilter("PENDING")}
            className={filter === "PENDING" ? "navItem active" : "navItem"}
          >
            Pending
          </button>
          <button
            onClick={() => setFilter("ALL")}
            className={filter === "ALL" ? "navItem active" : "navItem"}
          >
            All requests
          </button>
        </div>

        {/* Content */}
        {loading ? (
          <div style={{ display: "grid", gap: "12px" }}>
            {[1, 2].map((n) => (
              <div key={n} className="panel" style={{ height: "180px" }}>
                <div className="skeleton" style={{ height: "20px", width: "40%", marginBottom: "12px" }} />
                <div className="skeleton" style={{ height: "14px", width: "70%", marginBottom: "8px" }} />
                <div className="skeleton" style={{ height: "14px", width: "55%", marginBottom: "8px" }} />
                <div className="skeleton" style={{ height: "14px", width: "30%" }} />
              </div>
            ))}
          </div>
        ) : requests.length === 0 ? (
          <div className="panel" style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "280px", textAlign: "center" }}>
            <div className="emptyIcon" style={{ width: "56px", height: "56px", fontSize: "1.6rem", marginBottom: "12px" }}>✓</div>
            <div className="emptyTitle" style={{ fontSize: "1.15rem" }}>All Clear — No Pending Approvals</div>
            <div className="emptyMessage" style={{ maxWidth: "360px", marginTop: "8px" }}>
              There are no agent actions waiting for human review.
              Agent executions are running freely within your policy gates.
            </div>
          </div>
        ) : (
          <div style={{ display: "grid", gap: "14px" }}>
            {requests.map((req) => (
              <ApprovalCard
                key={req.id}
                request={req}
                onDecision={handleDecision}
              />
            ))}
          </div>
        )}
      </main>
    </>
  );
}
