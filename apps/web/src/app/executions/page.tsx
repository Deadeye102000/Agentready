import { cookies } from "next/headers";
import { Navbar } from "../../components/Navbar";
import { fetchDashboardData, fetchExecutions } from "../../lib/api";
import { ExecutionExplorer } from "./ExecutionExplorer";

export const metadata = {
  title: "Agent Executions | AgentReady",
  description: "Monitor agent execution runs, approval states, and risk levels in real time."
};

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
            Stream of all autonomous agent runs, human approval checkpoints, risk scores, and task contracts.
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

        <ExecutionExplorer executions={executions} />
      </main>
    </>
  );
}
