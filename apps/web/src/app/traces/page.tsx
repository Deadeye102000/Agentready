import { cookies } from "next/headers";
import Link from "next/link";
import { Navbar } from "../../components/Navbar";
import { fetchDashboardData, fetchToolCallTraces, statusClass } from "../../lib/api";

export const metadata = {
  title: "Tool Call Traces | AgentReady",
  description: "Granular execution traces, tool invocations, latencies, and security policy checks."
};

function formatDate(d?: string | null) {
  if (!d) return "n/a";
  try {
    return new Date(d).toLocaleString();
  } catch {
    return d;
  }
}

export default async function TracesPage({
  searchParams
}: {
  searchParams?: Promise<{ executionId?: string; page?: string }>;
}) {
  const cookieStore = await cookies();
  const cookieHeader = cookieStore.toString();
  const params = await searchParams;
  const executionId = params?.executionId;
  const page = params?.page ? parseInt(params.page, 10) : 1;

  const [dashRes, tracesRes] = await Promise.all([
    fetchDashboardData(cookieHeader),
    fetchToolCallTraces(executionId, page, 50, cookieHeader)
  ]);

  const orgName = dashRes.data?.organization?.name;
  const traces = tracesRes.data?.data || [];
  const pagination = tracesRes.data?.pagination;

  return (
    <>
      <Navbar orgName={orgName} />
      <main className="shell">
        <section className="hero">
          <div className="heroTag">Observability</div>
          <h1 className="heroTitle">Tool Call Traces</h1>
          <p className="heroSub">
            Audit-grade invocation traces for every tool called by autonomous agents, including latency, payloads, and gate decisions.
          </p>
        </section>

        {tracesRes.error && (
          <div className="errorBanner" role="alert" style={{ marginBottom: "20px" }}>
            <div className="errorContent">
              <div className="errorIcon">!</div>
              <div className="errorText">
                <strong>Backend Error:</strong> {tracesRes.error}
              </div>
            </div>
          </div>
        )}

        {executionId && (
          <div style={{
            display: "flex",
            alignItems: "center",
            gap: "12px",
            marginBottom: "18px",
            padding: "10px 16px",
            background: "#f8fafc",
            borderRadius: "8px",
            border: "1px solid #e2e8f0"
          }}>
            <span style={{ fontSize: "0.85rem", color: "#64748b" }}>Filtered by Execution:</span>
            <code style={{ fontSize: "0.85rem", fontWeight: 700, color: "#0f172a" }}>{executionId}</code>
            <Link href="/traces" style={{ marginLeft: "auto", fontSize: "0.82rem", color: "#6366f1", textDecoration: "none", fontWeight: 600 }}>
              Clear Filter ✕
            </Link>
          </div>
        )}

        <section className="panel wide">
          <div className="panelHead">
            <div>
              <h2 className="panelTitle">
                Traces {pagination ? `(${pagination.total})` : `(${traces.length})`}
              </h2>
              <p className="panelSubtitle">Synchronous and asynchronous tool call history</p>
            </div>
          </div>

          {traces.length === 0 ? (
            <div className="emptyState" style={{ padding: "48px 16px", textAlign: "center" }}>
              <div className="emptyIcon">✦</div>
              <div className="emptyTitle">No tool call traces found</div>
              <p className="emptyMessage" style={{ color: "#64748b", maxWidth: "450px", margin: "8px auto 0" }}>
                Tool traces are captured in real-time as agents invoke capabilities against the AgentReady gateway.
              </p>
            </div>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table className="table">
                <thead>
                  <tr>
                    <th>Trace ID</th>
                    <th>Tool Name</th>
                    <th>Status</th>
                    <th>Latency</th>
                    <th>Input Preview</th>
                    <th>Agent</th>
                    <th>Timestamp</th>
                  </tr>
                </thead>
                <tbody>
                  {traces.map((trace: any) => (
                    <tr key={trace.id}>
                      <td style={{ fontFamily: "monospace", fontSize: "0.82rem", color: "#64748b" }}>
                        {trace.id.slice(0, 12)}…
                      </td>
                      <td>
                        <code style={{
                          padding: "2px 6px",
                          background: "#f1f5f9",
                          borderRadius: "4px",
                          fontSize: "0.85rem",
                          fontWeight: 600,
                          color: "#1e293b"
                        }}>
                          {trace.toolName}
                        </code>
                      </td>
                      <td>
                        <span className={statusClass(trace.status)}>
                          {trace.status}
                        </span>
                      </td>
                      <td style={{ fontSize: "0.85rem", color: "#475569" }}>
                        {trace.latencyMs != null ? `${trace.latencyMs}ms` : "—"}
                      </td>
                      <td style={{ maxWidth: "220px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", fontSize: "0.82rem", fontFamily: "monospace", color: "#475569" }}>
                        {typeof trace.input === "object" ? JSON.stringify(trace.input) : String(trace.input || "—")}
                      </td>
                      <td>{trace.agent?.name || "Agent"}</td>
                      <td style={{ fontSize: "0.82rem", color: "#64748b" }}>
                        {formatDate(trace.createdAt || trace.startedAt)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </main>
    </>
  );
}
