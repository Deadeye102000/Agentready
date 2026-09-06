import { cookies } from "next/headers";
import Link from "next/link";
import { Navbar } from "../../components/Navbar";
import {
  fetchDashboardData,
  fetchEvalCases,
  fetchEvalRuns,
  fetchRegressionData
} from "../../lib/api";
import { EvalSuiteManager } from "./EvalSuiteManager";

export const metadata = {
  title: "Evaluation Suites | AgentReady",
  description: "Automated regression testing, test cases, and assertion scoring against task contracts."
};

export default async function EvalsPage() {
  const cookieStore = await cookies();
  const cookieHeader = cookieStore.toString();

  const [casesRes, runsRes, regressionRes, dashRes] = await Promise.all([
    fetchEvalCases(cookieHeader),
    fetchEvalRuns(cookieHeader),
    fetchRegressionData(cookieHeader),
    fetchDashboardData(cookieHeader)
  ]);

  const orgName = dashRes.data?.organization?.name;

  if (casesRes.error && !casesRes.data) {
    return (
      <>
        <Navbar orgName={orgName} />
        <main className="shell">
          <div className="errorBanner" role="alert" style={{ marginBottom: "24px" }}>
            <div className="errorContent">
              <div className="errorIcon">!</div>
              <div className="errorText">
                <strong>Backend Disconnected</strong>
                <span>{casesRes.error}</span>
              </div>
            </div>
          </div>

          <div className="card" style={{ padding: "32px", textAlign: "center" }}>
            <h2 style={{ fontSize: "1.2rem", fontWeight: "800", color: "#0f172a", marginBottom: "8px" }}>
              Unable to reach Evaluation Harness Service
            </h2>
            <p style={{ color: "#64748b", fontSize: "0.9rem", maxWidth: "500px", margin: "0 auto 20px" }}>
              The AgentReady Fastify API server on port 3001 could not be reached, or your session has expired.
            </p>
            <div style={{ display: "flex", gap: "12px", justifyContent: "center" }}>
              <Link href="/evals" className="retryBtn" style={{ textDecoration: "none" }}>
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
        <EvalSuiteManager
          initialCases={casesRes.data || []}
          initialRuns={runsRes.data || []}
          initialRegression={regressionRes.data || null}
          initialError={null}
          orgName={orgName}
        />
      </main>
    </>
  );
}
