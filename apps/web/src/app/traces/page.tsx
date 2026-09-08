import { cookies } from "next/headers";
import { Navbar } from "../../components/Navbar";
import { fetchDashboardData, fetchToolCallTraces } from "../../lib/api";
import { TraceInspector } from "./TraceInspector";

export const metadata = {
  title: "Tool Call Traces | AgentReady",
  description: "Granular execution traces, tool invocations, latencies, and security policy checks."
};

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
    fetchToolCallTraces(executionId, page, 100, cookieHeader)
  ]);

  const orgName = dashRes.data?.organization?.name;
  const traces = tracesRes.data?.data || [];

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

        <TraceInspector
          traces={traces}
          initialExecutionId={executionId}
        />
      </main>
    </>
  );
}
