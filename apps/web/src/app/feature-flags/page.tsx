import Link from "next/link";
import { cookies } from "next/headers";
import { toggleFeatureFlag } from "./actions";

type FeatureFlag = {
  id: string;
  capability: string;
  state: "ENABLED" | "DISABLED";
  description: string | null;
  agent: { name: string } | null;
};

type OrgDetails = {
  id: string;
  name: string;
};

const defaultCapabilities = [
  {
    capability: "agent_execution",
    title: "Agent Execution Engine",
    description: "Enables or disables creating and running agent executions globally for the organization."
  },
  {
    capability: "tool_execution",
    title: "Tool Execution Capabilities",
    description: "Allows executing custom integration tools like file read/write or network fetch."
  },
  {
    capability: "eval_runner",
    title: "Evaluation Testing Runner",
    description: "Validates agent runs against target contracts and assertions dynamically."
  },
  {
    capability: "mcp_server_access",
    title: "MCP Server Gateway",
    description: "Secures access to register and list Model Context Protocol integrations."
  },
  {
    capability: "auto_approval",
    title: "Auto Approval Bypass",
    description: "Allows automatic execution gate bypasses where permitted by policy. If disabled, all automatic bypasses are overridden to require manual approval."
  }
];

async function getFeatureFlags(): Promise<{ organization: OrgDetails | null; flags: FeatureFlag[] }> {
  const apiBaseUrl = process.env.AGENTREADY_API_URL ?? "http://localhost:3001";
  const cookieStore = await cookies();
  const cookieHeader = cookieStore.toString();

  try {
    const response = await fetch(`${apiBaseUrl}/api/v1/feature-flags`, {
      headers: {
        cookie: cookieHeader
      },
      cache: "no-store"
    });

    if (!response.ok) {
      return { organization: null, flags: [] };
    }

    const flags = await response.json() as FeatureFlag[];
    // Get org details from dashboard endpoint
    const dashResponse = await fetch(`${apiBaseUrl}/api/v1/observability/dashboard`, {
      headers: {
        cookie: cookieHeader
      },
      cache: "no-store"
    });
    let organization: OrgDetails | null = null;
    if (dashResponse.ok) {
      const data = await dashResponse.json();
      organization = data.organization;
    }

    return { organization, flags };
  } catch {
    return {
      organization: { id: "demo-org", name: "Demo Organization" },
      flags: [
        { id: "demo-flag-1", capability: "agent_execution", state: "ENABLED", description: "Allow running executions", agent: null }
      ]
    };
  }
}

export default async function FeatureFlagsPage() {
  const { organization, flags } = await getFeatureFlags();

  return (
    <main className="shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">AgentReady</p>
          <h1>Feature Flags Configuration</h1>
          <nav className="nav" style={{ marginTop: "0.75rem", display: "flex", gap: "1rem" }}>
            <Link href="/" style={{ color: "var(--muted)", textDecoration: "none" }}>Dashboard</Link>
            <Link href="/feature-flags" style={{ color: "var(--fg)", fontWeight: "bold", textDecoration: "none" }}>Feature Flags</Link>
          </nav>
        </div>
        <div className="orgBadge">{organization?.name ?? "No organization"}</div>
      </header>

      <section style={{ display: "grid", gridTemplateColumns: "1fr", gap: "1rem", marginTop: "1rem" }}>
        <div className="panel" style={{ padding: "1.5rem" }}>
          <div className="panelHeader" style={{ paddingBottom: "1rem", marginBottom: "1.5rem" }}>
            <h2>System-wide Capabilities Control</h2>
            <span>Configure feature policies for this workspace</span>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
            {defaultCapabilities.map((item) => {
              const matchedFlag = flags.find(
                (f) => f.capability === item.capability && !f.agent
              );
              // Default to ENABLED if no flag is configured in database yet
              const isEnabled = matchedFlag ? matchedFlag.state === "ENABLED" : true;
              const toggleAction = toggleFeatureFlag.bind(null, item.capability, null);

              return (
                <div
                  key={item.capability}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "1rem",
                    border: "1px solid #dfe3e7",
                    borderRadius: "8px",
                    background: "#ffffff"
                  }}
                >
                  <div style={{ paddingRight: "2rem" }}>
                    <h3 style={{ margin: "0 0 0.25rem", fontSize: "1.1rem" }}>{item.title}</h3>
                    <p style={{ margin: 0, fontSize: "0.9rem", color: "#5b6770" }}>{item.description}</p>
                    <span style={{ display: "inline-block", marginTop: "0.5rem", fontSize: "0.8rem", color: "#8a96a0" }}>
                      Capability key: <code>{item.capability}</code>
                    </span>
                  </div>

                  <div>
                    <form action={toggleAction}>
                      <button
                        type="submit"
                        style={{
                          cursor: "pointer",
                          padding: "0.5rem 1.25rem",
                          borderRadius: "6px",
                          fontWeight: "bold",
                          fontSize: "0.9rem",
                          border: isEnabled ? "1px solid #c3e6cb" : "1px solid #f5c6cb",
                          background: isEnabled ? "#d4edda" : "#f8d7da",
                          color: isEnabled ? "#155724" : "#721c24"
                        }}
                      >
                        {isEnabled ? "ENABLED" : "DISABLED"}
                      </button>
                    </form>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>
    </main>
  );
}
