import { cookies } from "next/headers";
import { LandingView } from "../../components/LandingView";

export const metadata = {
  title: "AgentReady | The Deterministic Governance & Control Plane for AI Agents",
  description:
    "Secure every autonomous AI agent action with trajectory contracts, single-flight state machine locks, and human-in-the-loop approval gates across MCP tools and enterprise APIs."
};

export default async function LandingPage() {
  const cookieStore = await cookies();
  const sessionToken = cookieStore.get("agentready_session")?.value;
  const isAuthenticated = Boolean(sessionToken);

  return <LandingView isAuthenticated={isAuthenticated} />;
}
