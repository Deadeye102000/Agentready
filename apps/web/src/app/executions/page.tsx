import { cookies } from "next/headers";
import Link from "next/link";
import { Navbar } from "../../components/Navbar";
import { fetchDashboardData, fetchExecutions, statusClass } from "../../lib/api";

export const metadata = {
  title: "Agent Executions | AgentReady",
  description: "Monitor agent execution runs, approval states, and risk levels in real time."
};

function formatDate(d: string | null) {
  if (!d) return "n/a";
  try {
    return new Date(d).toLocaleString();
  } catch {
    return d;
  }
}

export default async function ExecutionsPage() {
  const cookieStore = await cookies();
  const cookieHeader = cookieStore.toString();

  const [dashRes, execsRes] = await Promise.all([
    fetchDashboardData(cookieHeader),
    fetchExecutions(cookieHeader, { limit: 100 })
  ]);

  const orgName = dashRes.data?.organization?.name;
  const executions = execsRes.data || [];

  return (
    <>
      <Navbar orgName={orgName} />
      <main className="shell">
        <section className="hero">
          <div className="heroTag">Runtime Governance</div>
          <h1 className="heroTitle">Agent Executions</h1>
          <p className="heroSub">
            Real-time stream of all autonomous agent execution runs, human approval checkpoints, and task outputs.
          </p>
        </section>

        {execsRes.error && (
          <div className="errorBanner" role="alert" style={{ marginBottom: "20px" }}>
            <div className="errorContent">
              <div className="errorIcon">!</div>
              <div className="errorText">
                <strong>Backend Error:</strong> {execsRes.error}
              </div>
            </div>
          </div>
        )}

        <section className="panel wide">
          <div className="panelHead">
            <div>
              <h2 className="panelTitle">All Executions ({executions.length})</h2>
              <p className="panelSubtitle">Recorded lifecycle states and risk scores</p>
            </div>
          </div>

          {executions.length === 0 ? (
            <div className="emptyState" style={{ padding: "48px 16px", textAlign: "center" }}>
              <div className="emptyIcon">✦</div>
              <div className="emptyTitle">No executions found</div>
              <p className="emptyMessage" style={{ color: "#64748b", maxWidth: "450px", margin: "8px auto 0" }}>
                Executions will appear here when agents start tasks via the SDK, MCP server, or the Interactive Sandbox.
              </p>
            </div>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table className="table">
                <thead>
                  <tr>
                    <th>Execution ID</th>
                    <th>Status</th>
                    <th>Objective</th>
                    <th>Agent</th>
                    <th>Contract</th>
                    <th>Risk</th>
                    <th>Created</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {executions.map((exec: any) => (
                    <tr key={exec.id}>
                      <td style={{ fontFamily: "monospace", fontSize: "0.82rem" }}>
                        <Link href={`/executions/${exec.id}`} style={{ color: "#6366f1", fontWeight: 600 }}>
                          {exec.id.slice(0, 16)}…
                        </Link>
                      </td>
                      <td>
                        <span className={statusClass(exec.status)}>
                          {exec.status}
                        </span>
                      </td>
                      <td style={{ maxWidth: "260px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {exec.objective || "No objective"}
                      </td>
                      <td>{exec.agent?.name || "Anonymous Agent"}</td>
                      <td>
                        {exec.contract ? (
                          <span style={{ fontSize: "0.85rem", color: "#475569" }}>
                            {exec.contract.name} (v{exec.contract.version})
                          </span>
                        ) : (
                          <span style={{ color: "#94a3b8" }}>—</span>
                        )}
                      </td>
                      <td>
                        <span style={{
                          fontWeight: 700,
                          color: (exec.riskScore ?? 0) > 70 ? "#ef4444" : (exec.riskScore ?? 0) > 40 ? "#f59e0b" : "#10b981"
                        }}>
                          {exec.riskScore ?? 0}
                        </span>
                      </td>
                      <td style={{ fontSize: "0.82rem", color: "#64748b" }}>
                        {formatDate(exec.createdAt)}
                      </td>
                      <td>
                        <Link
                          href={`/executions/${exec.id}`}
                          style={{
                            padding: "4px 10px",
                            background: "#f1f5f9",
                            borderRadius: "6px",
                            color: "#334155",
                            textDecoration: "none",
                            fontSize: "0.82rem",
                            fontWeight: 600
                          }}
                        >
                          View Details →
                        </Link>
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
