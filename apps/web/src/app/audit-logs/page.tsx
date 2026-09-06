import { cookies } from "next/headers";
import Link from "next/link";
import { Navbar } from "../../components/Navbar";
import { fetchAuditLogs, fetchDashboardData } from "../../lib/api";
import { AuditLogViewer } from "./AuditLogViewer";

export const metadata = {
  title: "Audit Logs | AgentReady",
  description: "Immutable governance audit log for AI agent actions, approval reviews, and policy changes."
};

export default async function AuditLogsPage() {
  const cookieStore = await cookies();
  const cookieHeader = cookieStore.toString();

  const [auditRes, dashRes] = await Promise.all([
    fetchAuditLogs(100, cookieHeader),
    fetchDashboardData(cookieHeader)
  ]);

  const orgName = dashRes.data?.organization?.name;

  if (auditRes.error && !auditRes.data) {
    return (
      <>
        <Navbar orgName={orgName} />
        <main className="shell">
          <div className="errorBanner" role="alert" style={{ marginBottom: "24px" }}>
            <div className="errorContent">
              <div className="errorIcon">!</div>
              <div className="errorText">
                <strong>Backend Disconnected</strong>
                <span>{auditRes.error}</span>
              </div>
            </div>
          </div>

          <div className="card" style={{ padding: "32px", textAlign: "center" }}>
            <h2 style={{ fontSize: "1.2rem", fontWeight: "800", color: "#0f172a", marginBottom: "8px" }}>
              Unable to reach the Audit Ledger Service
            </h2>
            <p style={{ color: "#64748b", fontSize: "0.9rem", maxWidth: "500px", margin: "0 auto 20px" }}>
              The AgentReady Fastify API server on port 3001 could not be reached, or your session has expired.
            </p>
            <div style={{ display: "flex", gap: "12px", justifyContent: "center" }}>
              <Link href="/audit-logs" className="retryBtn" style={{ textDecoration: "none" }}>
                ↻ Retry Connection
              </Link>
              <Link href="/login" style={{
                padding: "8px 16px",
                background: "#f1f5f9",
                color: "#334155",
                borderRadius: "8px",
                fontSize: "0.85rem",
                fontWeight: "600",
                textDecoration: "none",
                display: "inline-flex",
                alignItems: "center"
              }}>
                Sign In Again
              </Link>
            </div>
          </div>
        </main>
      </>
    );
  }

  return (
    <>
      <Navbar orgName={orgName} />
      <main className="shell">
        <AuditLogViewer
          initialLogs={auditRes.data || []}
          initialError={null}
          orgName={orgName}
        />
      </main>
    </>
  );
}
