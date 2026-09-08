import { cookies } from "next/headers";
import Link from "next/link";
import { Navbar } from "../../components/Navbar";
import { fetchDashboardData, statusClass } from "../../lib/api";
import { McpClientGuide } from "./McpClientGuide";

export const metadata = {
  title: "Model Context Protocol (MCP) | AgentReady",
  description: "Connect Claude Desktop, Cursor, and IDE agents to the AgentReady MCP governance gateway."
};

const MCP_TOOLS = [
  {
    name: "list_task_contracts",
    scope: "contracts:read",
    description: "Queries all approved organization task contracts, success criteria, and governance bounds.",
    params: "None (Scoped to Caller Organization)"
  },
  {
    name: "get_contract_context",
    scope: "contracts:read",
    description: "Inspects specific contract details, allowed tool signatures, and required human approvals.",
    params: "contractId: string"
  },
  {
    name: "list_available_tools",
    scope: "governance:read",
    description: "Verifies active capability feature flags and approval gates before an agent executes tools.",
    params: "agentId?: string"
  },
  {
    name: "start_execution",
    scope: "executions:write",
    description: "Initiates a governed execution run under a contract with automated risk evaluation and gating.",
    params: "projectId: string, contractId?: string, objective: string, riskScore?: number"
  },
  {
    name: "get_execution_status",
    scope: "executions:read",
    description: "Polls execution state, human supervisor review decisions, and result payloads.",
    params: "executionId: string"
  }
];

export default async function McpPage() {
  const cookieStore = await cookies();
  const cookieHeader = cookieStore.toString();

  const dashRes = await fetchDashboardData(cookieHeader);
  const orgName = dashRes.data?.organization?.name;
  const servers = dashRes.data?.mcpServers || [];

  return (
    <>
      <Navbar orgName={orgName} />
      <main className="shell">
        <section className="hero">
          <div className="heroTag">Model Context Protocol</div>
          <h1 className="heroTitle">MCP Governance Gateway</h1>
          <p className="heroSub">
            Expose AgentReady guardrails, task contracts, and approval gates directly to Claude Desktop, Cursor, and IDE agents via standard JSON-RPC 2.0.
          </p>
        </section>

        {/* Gateway Architecture & Status Card */}
        <div className="gatewayBanner">
          <div className="bannerLeft">
            <div className="statusIndicator">
              <span className="pulseDot"></span>
              <span className="statusText">GATEWAY STATUS: ONLINE</span>
            </div>
            <h2 className="bannerHeading">Autonomous Agent Governance Layer</h2>
            <p className="bannerDesc">
              The AgentReady MCP server bridges AI models (Claude, Cursor, custom agents) with enterprise policy enforcement. Tools invoked by external agents pass through cryptographic contract checks before execution.
            </p>
          </div>

          <div className="serverInfoBox">
            <div className="infoItem">
              <span className="infoLabel">Protocol Version:</span>
              <span className="infoVal">MCP Specification 2024-11-05</span>
            </div>
            <div className="infoItem">
              <span className="infoLabel">Registered Gateways:</span>
              <span className="infoVal">{servers.length > 0 ? `${servers.length} Active` : "1 Built-in Gateway"}</span>
            </div>
            <div className="infoItem">
              <span className="infoLabel">Default Transport:</span>
              <span className="infoVal">Stdio / Subprocess & HTTP SSE</span>
            </div>
          </div>
        </div>

        {/* Spacious Grid of Exposed MCP Tools */}
        <section className="toolsSection">
          <div className="sectionHeader">
            <div>
              <h2 className="sectionTitle">Exposed MCP Tools & Capabilities</h2>
              <p className="sectionSubtitle">
                Standard tools registered by AgentReady for AI agents to query contracts and initiate governed work.
              </p>
            </div>
            <span className="toolsCountBadge">{MCP_TOOLS.length} Tools Available</span>
          </div>

          <div className="toolsGrid">
            {MCP_TOOLS.map((tool) => (
              <div key={tool.name} className="toolCard">
                <div className="toolCardHeader">
                  <span className="toolName">
                    🔧 <code>{tool.name}</code>
                  </span>
                  <span className="scopeBadge">
                    🔒 {tool.scope}
                  </span>
                </div>

                <p className="toolDesc">{tool.description}</p>

                <div className="toolParamsRow">
                  <span className="paramLabel">Parameters:</span>
                  <code className="paramCode">{tool.params}</code>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Interactive Client Connection Guide */}
        <McpClientGuide />

        {/* Environment Variables Reference */}
        <section className="envSection">
          <h3 className="envTitle">Required Environment Variables</h3>
          <div className="envTableWrapper">
            <table className="table">
              <thead>
                <tr>
                  <th>Variable</th>
                  <th>Default / Example</th>
                  <th>Description</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td><code>AGENTREADY_API_URL</code></td>
                  <td><code>http://localhost:3001</code></td>
                  <td>The base URL of the AgentReady backend Fastify control plane.</td>
                </tr>
                <tr>
                  <td><code>AGENTREADY_API_KEY</code></td>
                  <td><code>ar_live_demo_agent_key_...</code></td>
                  <td>Machine Bearer API key issued with appropriate scopes (<code>contracts:read</code>, <code>executions:write</code>).</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>
      </main>
    </>
  );
}
