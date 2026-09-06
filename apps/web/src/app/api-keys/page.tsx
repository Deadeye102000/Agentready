import { cookies } from "next/headers";
import Link from "next/link";
import { Navbar } from "../../components/Navbar";
import { fetchApiKeys, fetchDashboardData } from "../../lib/api";
import { ApiKeyManager } from "./ApiKeyManager";

export const metadata = {
  title: "API Keys | AgentReady",
  description: "Manage machine credentials and scopes for autonomous agents and external worker runtimes."
};

export default async function ApiKeysPage() {
  const cookieStore = await cookies();
  const cookieHeader = cookieStore.toString();

  const [keysRes, dashRes] = await Promise.all([
    fetchApiKeys(cookieHeader),
    fetchDashboardData(cookieHeader)
  ]);

  const orgName = dashRes.data?.organization?.name;

  if (keysRes.error && !keysRes.data) {
    return (
      <>
        <Navbar orgName={orgName} />
        <main className="shell">
          <div className="errorBanner" role="alert" style={{ marginBottom: "24px" }}>
            <div className="errorContent">
              <div className="errorIcon">!</div>
              <div className="errorText">
                <strong>Backend Disconnected or Access Denied</strong>
                <span>{keysRes.error}</span>
              </div>
            </div>
          </div>

          <div className="card" style={{ padding: "32px", textAlign: "center" }}>
            <h2 style={{ fontSize: "1.2rem", fontWeight: "800", color: "#0f172a", marginBottom: "8px" }}>
              Unable to reach API Key Management Service
            </h2>
            <p style={{ color: "#64748b", fontSize: "0.9rem", maxWidth: "500px", margin: "0 auto 20px" }}>
              {keysRes.error?.includes("403")
                ? "Your current session does not have OWNER or ADMIN privileges required to manage machine credentials."
                : "The AgentReady Fastify API server on port 3001 could not be reached, or your session has expired."}
            </p>
            <div style={{ display: "flex", gap: "12px", justifyContent: "center" }}>
              <Link href="/api-keys" className="retryBtn" style={{ textDecoration: "none" }}>
                ↻ Retry Connection
              </Link>
              <Link href="/" style={{
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
                Return to Dashboard
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
        <ApiKeyManager
          initialKeys={keysRes.data || []}
          initialError={null}
          orgName={orgName}
        />
      </main>
    </>
  );
}
