import { cookies } from "next/headers";
import Link from "next/link";
import { Navbar } from "../../components/Navbar";
import { fetchDashboardData, statusClass } from "../../lib/api";

export const metadata = {
  title: "Model Context Protocol (MCP) | AgentReady",
  description: "Connect Claude Desktop, Cursor, and IDE agents to the AgentReady MCP governance gateway."
};

const MCP_TOOLS = [
  {
    name: "list_task_contracts",
    scope: "contracts:read",
    description: "Query approved organization task contracts, success criteria, and governance bounds."
  },
  {
    name: "get_contract_context",
    scope: "contracts:read",
    description: "Inspect specific contract details, allowed tool signatures, and required human approvals."
  },
  {
    name: "list_available_tools",
    scope: "governance:read",
    description: "Check active capability flags and approval gates before invoking tools."
  },
  {
    name: "start_execution",
    scope: "executions:write",
    description: "Initiate a governed execution run under a contract with automated policy enforcement."
  },
  {
    name: "get_execution_status",
    scope: "executions:read",
    description: "Poll lifecycle state, human review decisions, and result payloads for an execution run."
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
            Expose AgentReady guardrails, task contracts, and approval gates directly to Claude Desktop, Cursor, and IDE agent runners via standard MCP.
          </p>
        </section>

        <section className="panel wide" style={{ marginBottom: "24px" }}>
          <div className="panelHead">
            <div>
              <h2 className="panelTitle">Registered MCP Gateways ({servers.length})</h2>
              <p className="panelSubtitle">Active MCP server endpoints configured for your organization</p>
            </div>
          </div>

          {servers.length === 0 ? (
            <div className="emptyState" style={{ padding: "32px 16px", textAlign: "center" }}>
              <div className="emptyIcon">✦</div>
              <div className="emptyTitle">Default MCP Gateway Ready</div>
              <p className="emptyMessage" style={{ color: "#64748b", maxWidth: "450px", margin: "8px auto 0" }}>
                The built-in AgentReady MCP server is available at <code>apps/mcp-server</code>.
              </p>
            </div>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table className="table">
                <thead>
                  <tr>
                    <th>Gateway Name</th>
                    <th>Status</th>
                    <th>Capabilities</th>
                  </tr>
                </thead>
                <tbody>
                  {servers.map((server: any) => (
                    <tr key={server.id}>
                      <td style={{ fontWeight: 600, color: "#0f172a" }}>{server.name}</td>
                      <td>
                        <span className={statusClass(server.status)}>
                          {server.status}
                        </span>
                      </td>
                      <td>
                        <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
                          {server.capabilities?.map((cap: string) => (
                            <span key={cap} style={{
                              padding: "2px 8px",
                              background: "#f1f5f9",
                              borderRadius: "4px",
                              fontSize: "0.8rem",
                              fontFamily: "monospace",
                              color: "#334155"
                            }}>
                              {cap}
                            </span>
                          ))}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="panel wide" style={{ marginBottom: "24px" }}>
          <div className="panelHead">
            <div>
              <h2 className="panelTitle">Exposed MCP Tools</h2>
              <p className="panelSubtitle">Capabilities provided to AI assistants via the AgentReady MCP server</p>
            </div>
          </div>

          <div style={{ overflowX: "auto" }}>
            <table className="table">
              <thead>
                <tr>
                  <th>Tool Name</th>
                  <th>Required Scope</th>
                  <th>Description</th>
                </tr>
              </thead>
              <tbody>
                {MCP_TOOLS.map((tool) => (
                  <tr key={tool.name}>
                    <td>
                      <code style={{
                        padding: "3px 8px",
                        background: "#f1f5f9",
                        borderRadius: "6px",
                        fontSize: "0.85rem",
                        fontWeight: 700,
                        color: "#6366f1"
                      }}>
                        {tool.name}
                      </code>
                    </td>
                    <td>
                      <span style={{
                        padding: "2px 6px",
                        background: "#e0e7ff",
                        color: "#4338ca",
                        borderRadius: "4px",
                        fontSize: "0.78rem",
                        fontFamily: "monospace",
                        fontWeight: 600
                      }}>
                        {tool.scope}
                      </span>
                    </td>
                    <td style={{ color: "#475569", fontSize: "0.88rem" }}>
                      {tool.description}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="panel wide">
          <div className="panelHead">
            <div>
              <h2 className="panelTitle">Client Setup (Claude Desktop & Cursor)</h2>
              <p className="panelSubtitle">Add AgentReady governance tools to your desktop AI tools</p>
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
            <p style={{ margin: 0, fontSize: "0.9rem", color: "#475569" }}>
              Add the following snippet to your <code>claude_desktop_config.json</code>:
            </p>
            <pre style={{
              background: "#0f172a",
              color: "#f8fafc",
              padding: "16px",
              borderRadius: "8px",
              fontSize: "0.82rem",
              overflowX: "auto",
              fontFamily: "monospace"
            }}>
{`{
  "mcpServers": {
    "agentready": {
      "command": "node",
      "args": ["<PATH_TO_AGENTREADY>/apps/mcp-server/dist/index.js"],
      "env": {
        "AGENTREADY_API_URL": "http://localhost:3001",
        "AGENTREADY_API_KEY": "ar_live_your_generated_api_key"
      }
    }
  }
}`}
            </pre>
            <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
              <Link
                href="/api-keys"
                style={{
                  padding: "8px 16px",
                  background: "#6366f1",
                  color: "#ffffff",
                  borderRadius: "8px",
                  textDecoration: "none",
                  fontWeight: 600,
                  fontSize: "0.85rem"
                }}
              >
                Generate MCP API Key →
              </Link>
            </div>
          </div>
        </section>
      </main>
    </>
  );
}
