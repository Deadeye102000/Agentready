"use client";

import Link from "next/link";
import { useState } from "react";

export function LandingView({ isAuthenticated = false }: { isAuthenticated?: boolean }) {
  const [activeTab, setActiveTab] = useState<"python" | "policy" | "trace">("python");
  const [copied, setCopied] = useState(false);

  const codeSnippets = {
    python: `# agent_runner.py — AgentReady Python Governance SDK
from agentready_governance_sdk import AgentReadyClient, guard_tool

client = AgentReadyClient(
    api_url="http://localhost:3001",
    api_key="ar_sec_live_9f82c4e1...",
)

@guard_tool(
    client=client,
    tool_name="stripe_refund",
    risk_threshold=70,
    required_params=["charge_id", "amount"]
)
def issue_refund(charge_id: str, amount: float) -> dict:
    """Safely executed only if single-flight lock & policy gates pass."""
    return stripe.Refund.create(charge=charge_id, amount=int(amount * 100))

# Autonomous LangGraph / CrewAI step interception
result = client.intercept_execution(
    agent_id="agent_fintech_reconcile",
    objective="Process high-value dispute for customer #8839",
    action=lambda: issue_refund("ch_3M45xA", 850.00)
)`,
    policy: `# task-contract.yaml — Declarative Trajectory Policy
version: "1.0"
contract_name: "FinTech Dispute & Refund Reconciliation"
risk_ceiling: 80
enforcement_mode: "STRICT_DETERMINISTIC"

trajectory_policy:
  expected_sequence:
    - tool: "lookup_customer"
      mode: "AUTOMATIC"
      max_latency_ms: 1200
    - tool: "verify_dispute_evidence"
      mode: "AUTOMATIC"
      risk_score_max: 40
    - tool: "stripe_refund"
      mode: "REQUIRE_APPROVAL"
      risk_score_threshold: 65
      approval_roles: ["ADMIN", "APPROVER"]
    - tool: "send_slack_audit_receipt"
      mode: "AUTOMATIC"

forbidden_tools:
  - "raw_database_sql"
  - "override_user_kyc"
  - "export_all_cards"`,
    trace: `{
  "trace_id": "tr_01HX98K2MN5PQ8",
  "execution_id": "exec_fintech_9941",
  "agent_id": "agent_fintech_reconcile",
  "step_index": 3,
  "tool_name": "stripe_refund",
  "state_machine_transition": {
    "from": "RUNNING",
    "to": "WAITING_FOR_APPROVAL",
    "single_flight_lock": "ACQUIRED"
  },
  "policy_evaluation": {
    "risk_score": 78,
    "threshold": 65,
    "decision": "GATE_INTERCEPTED",
    "reason": "Refund amount ($850.00) exceeds automatic limit ($500.00)"
  },
  "provenance_ledger": {
    "prev_hash": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    "entry_digest": "8f4e132e65a6f87d468137359c5d0701198533d73507b9a527c739df4a3b8d14",
    "signature": "ed25519:3b94a8f9c1...signed_by_agentready_control_plane"
  }
}`
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(codeSnippets[activeTab]);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="landingRoot">
      {/* Background ambient glow elements */}
      <div className="ambientGlowTop" />
      <div className="ambientGlowBottom" />

      {/* Global Landing Navigation */}
      <header className="landingHeader">
        <div className="landingNavContainer">
          <div className="landingBrand">
            <div className="landingLogo">AR</div>
            <div className="landingBrandText">
              <span className="landingTitle">AgentReady</span>
              <span className="landingSubtitle">Deterministic Agent Control Plane</span>
            </div>
          </div>

          <nav className="landingNavLinks">
            <a href="#threats" className="landingNavLink">Threat Surface</a>
            <a href="#pillars" className="landingNavLink">Architecture</a>
            <a href="#code" className="landingNavLink">Policy as Code</a>
            <a href="#ecosystem" className="landingNavLink">Ecosystem</a>
            <a
              href="https://github.com/Deadeye102000/Agentready"
              target="_blank"
              rel="noreferrer"
              className="landingNavLink"
            >
              GitHub ↗
            </a>
          </nav>

          <div className="landingNavActions">
            {isAuthenticated ? (
              <Link href="/" className="landingPrimaryBtn">
                Open Dashboard →
              </Link>
            ) : (
              <>
                <Link href="/login" className="landingSecondaryBtn">
                  Sign In
                </Link>
                <Link href="/register" className="landingPrimaryBtn">
                  Launch Console
                </Link>
              </>
            )}
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="landingHero">
        <div className="landingContainer">
          <div className="heroBadgeWrapper">
            <span className="heroPill">
              <span className="pillDot" />
              Model Context Protocol (MCP) Native • Python Governance SDK
            </span>
          </div>

          <h1 className="heroTitle">
            The Deterministic Governance &amp; Execution Control Plane for{" "}
            <span className="heroGradientText">Autonomous AI Agents</span>
          </h1>

          <p className="heroDescription">
            Never hand autonomous models unconstrained API keys. AgentReady acts as the governed
            execution middleware: enforcing single-flight state machine locks, trajectory contracts,
            and human-in-the-loop approval gates before agents touch your downstream APIs or databases.
          </p>

          <div className="heroCtas">
            {isAuthenticated ? (
              <Link href="/" className="heroBtnPrimary">
                Open Live Dashboard <span>→</span>
              </Link>
            ) : (
              <>
                <Link href="/login" className="heroBtnPrimary">
                  Access Live Console <span>→</span>
                </Link>
                <Link href="/register" className="heroBtnSecondary">
                  Create Organization Account
                </Link>
              </>
            )}
            <a
              href="https://github.com/Deadeye102000/Agentready"
              target="_blank"
              rel="noreferrer"
              className="heroBtnOutline"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" />
              </svg>
              View Repository &amp; Tests
            </a>
          </div>

          {/* Value metrics strip */}
          <div className="heroMetricsGrid">
            <div className="heroMetricCard">
              <span className="metricValue">&lt; 4ms</span>
              <span className="metricLabel">Pre-Flight Policy Check Latency</span>
            </div>
            <div className="heroMetricCard">
              <span className="metricValue">0-LLM</span>
              <span className="metricLabel">Pure Deterministic Trajectory Scoring</span>
            </div>
            <div className="heroMetricCard">
              <span className="metricValue">Strict Lock</span>
              <span className="metricLabel">Single-Flight Concurrency Control</span>
            </div>
            <div className="heroMetricCard">
              <span className="metricValue">MCP Native</span>
              <span className="metricLabel">Model Context Protocol Stdio &amp; SSE</span>
            </div>
          </div>
        </div>
      </section>

      {/* Threat Surface Section (Education / Problem Framing inspired by AgentDNA) */}
      <section id="threats" className="landingSection threatSection">
        <div className="landingContainer">
          <div className="sectionHeader">
            <span className="sectionEyebrow">The Enterprise Threat Surface</span>
            <h2 className="sectionTitle">Why Unmonitored Autonomous Agents Fail in Production</h2>
            <p className="sectionSubtitle">
              As AI models move from simple conversational chatbots to autonomous agents executing
              destructive tools, standard API keys create catastrophic liability.
            </p>
          </div>

          <div className="threatGrid">
            <div className="threatCard">
              <div className="threatIconWrapper threatRed">
                <span>⚠️</span>
              </div>
              <h3 className="threatTitle">Unsafe Multi-Agent Delegation</h3>
              <p className="threatDescription">
                When a coordinator agent delegates to sub-agents, human context and identity are lost.
                Downstream tools cannot tell if an action originated from a verified executive or a rogue prompt.
              </p>
              <div className="threatResolution">
                <strong>AgentReady Resolution:</strong> Cryptographic delegation chains &amp; server-derived organizational context.
              </div>
            </div>

            <div className="threatCard">
              <div className="threatIconWrapper threatAmber">
                <span>⚡</span>
              </div>
              <h3 className="threatTitle">Over-Privileged Tool Execution</h3>
              <p className="threatDescription">
                Agents given broad API keys can delete production tables, drain customer balances, or
                trigger unauthorized wire transfers without gating.
              </p>
              <div className="threatResolution">
                <strong>AgentReady Resolution:</strong> Dynamic approval gates (`AUTOMATIC`, `REQUIRE_APPROVAL`, `BLOCKED`) with risk ceilings.
              </div>
            </div>

            <div className="threatCard">
              <div className="threatIconWrapper threatPurple">
                <span>🎯</span>
              </div>
              <h3 className="threatTitle">Prompt Injection Trajectory Drift</h3>
              <p className="threatDescription">
                Adversarial prompt injections manipulate reasoning loops into skipping validation steps,
                executing forbidden tools, or tampering with parameters.
              </p>
              <div className="threatResolution">
                <strong>AgentReady Resolution:</strong> Deterministic Trajectory Policies (`@agentready/agent-contracts`) matching golden paths.
              </div>
            </div>

            <div className="threatCard">
              <div className="threatIconWrapper threatCyan">
                <span>🔒</span>
              </div>
              <h3 className="threatTitle">Black-Box Handoffs &amp; Untracked Audits</h3>
              <p className="threatDescription">
                Traditional application logs cannot reconstruct non-deterministic LLM decision paths,
                making SOC 2, ISO 42001, and HIPAA compliance audits impossible.
              </p>
              <div className="threatResolution">
                <strong>AgentReady Resolution:</strong> Immutable step-by-step tool traces with state machine transition invariants.
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* The 3 Core Pillars (Connect • Govern • Prove) */}
      <section id="pillars" className="landingSection">
        <div className="landingContainer">
          <div className="sectionHeader">
            <span className="sectionEyebrow">Complete Lifecycle Control</span>
            <h2 className="sectionTitle">Connect • Govern • Prove</h2>
            <p className="sectionSubtitle">
              An end-to-end architecture built to secure every layer of agent execution.
            </p>
          </div>

          <div className="pillarsGrid">
            <div className="pillarCard">
              <div className="pillarNumber">01</div>
              <div className="pillarBadge pillarBlue">CONNECT</div>
              <h3 className="pillarTitle">Native Interception &amp; Discovery</h3>
              <p className="pillarText">
                Connect any agent framework through standard Model Context Protocol (MCP) or our lightweight
                Python Governance SDK. Automatically discover task contracts, enforce scopes, and verify
                credentials before execution runs start.
              </p>
              <ul className="pillarList">
                <li>✦ MCP stdio &amp; SSE transport support</li>
                <li>✦ Machine API key authentication with explicit scopes</li>
                <li>✦ Server-enforced Human Governance Invariant</li>
              </ul>
            </div>

            <div className="pillarCard activePillar">
              <div className="pillarNumber">02</div>
              <div className="pillarBadge pillarGreen">GOVERN</div>
              <h3 className="pillarTitle">Deterministic Policy Gates</h3>
              <p className="pillarText">
                Intercept tool calls with sub-5ms pre-flight policy gates. High-risk executions enter
                atomic `WAITING_FOR_APPROVAL` state, notifying human reviewers and locking concurrent runs.
              </p>
              <ul className="pillarList">
                <li>✦ Three-tier modes: Automatic, Require Approval, Blocked</li>
                <li>✦ Hierarchical feature flags across org and agent scopes</li>
                <li>✦ Single-flight locks preventing race conditions</li>
              </ul>
            </div>

            <div className="pillarCard">
              <div className="pillarNumber">03</div>
              <div className="pillarBadge pillarIndigo">PROVE</div>
              <h3 className="pillarTitle">Continuous Trajectory Evaluation</h3>
              <p className="pillarText">
                Evaluate actual execution paths against mathematical trajectory contracts. Pure zero-LLM
                sequence matchers compute objective compliance scores and run regression suites in CI/CD.
              </p>
              <ul className="pillarList">
                <li>✦ Zero-LLM sequence matcher (0.00 – 1.00 score)</li>
                <li>✦ Headless CLI regression runner (`pnpm eval:regression`)</li>
                <li>✦ Adversarial FinTech test suite seeded out-of-the-box</li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* Interactive Code & Policy Showcase (Inspired by AgentDNA) */}
      <section id="code" className="landingSection codeSection">
        <div className="landingContainer">
          <div className="sectionHeader">
            <span className="sectionEyebrow">Developer First Experience</span>
            <h2 className="sectionTitle">Policy as Code Meets Real-Time Tracing</h2>
            <p className="sectionSubtitle">
              Integrate with 3 lines of Python, declare trajectory policies in Git, and inspect
              tamper-evident audit traces with cryptographic certainty.
            </p>
          </div>

          <div className="codeConsoleWrapper">
            <div className="codeConsoleHeader">
              <div className="codeConsoleTabs">
                <button
                  className={`consoleTab ${activeTab === "python" ? "active" : ""}`}
                  onClick={() => setActiveTab("python")}
                >
                  <span className="tabDot pyDot" />
                  agent_runner.py
                </button>
                <button
                  className={`consoleTab ${activeTab === "policy" ? "active" : ""}`}
                  onClick={() => setActiveTab("policy")}
                >
                  <span className="tabDot yamlDot" />
                  task-contract.yaml
                </button>
                <button
                  className={`consoleTab ${activeTab === "trace" ? "active" : ""}`}
                  onClick={() => setActiveTab("trace")}
                >
                  <span className="tabDot jsonDot" />
                  audit-trace.json
                </button>
              </div>

              <div className="consoleActions">
                <button className="copyBtn" onClick={handleCopy}>
                  {copied ? "✓ Copied!" : "Copy Code"}
                </button>
              </div>
            </div>

            <pre className="codeBlock">
              <code>{codeSnippets[activeTab]}</code>
            </pre>
          </div>
        </div>
      </section>

      {/* Ecosystem & Compatibility Grid */}
      <section id="ecosystem" className="landingSection">
        <div className="landingContainer">
          <div className="sectionHeader">
            <span className="sectionEyebrow">Open Architecture</span>
            <h2 className="sectionTitle">Engineered for the Modern AI Stack</h2>
            <p className="sectionSubtitle">
              Works seamlessly with any autonomous framework, protocol, and enterprise data source.
            </p>
          </div>

          <div className="ecosystemGrid">
            <div className="ecoCard">
              <span className="ecoCategory">Protocols &amp; Standards</span>
              <h4 className="ecoTitle">Model Context Protocol (MCP)</h4>
              <p className="ecoDesc">Native stdio &amp; SSE server exposing context discovery &amp; gated tool invocation.</p>
            </div>
            <div className="ecoCard">
              <span className="ecoCategory">Agent Frameworks</span>
              <h4 className="ecoTitle">LangGraph &amp; LangChain</h4>
              <p className="ecoDesc">Pre-flight tool check interceptors and trajectory callback handlers.</p>
            </div>
            <div className="ecoCard">
              <span className="ecoCategory">Multi-Agent Systems</span>
              <h4 className="ecoTitle">CrewAI &amp; AutoGen</h4>
              <p className="ecoDesc">Multi-agent delegation tracking and organizational scope boundaries.</p>
            </div>
            <div className="ecoCard">
              <span className="ecoCategory">Enterprise APIs</span>
              <h4 className="ecoTitle">Stripe, Slack &amp; GitHub</h4>
              <p className="ecoDesc">High-risk action gating with interactive Slack &amp; Web approval workflows.</p>
            </div>
            <div className="ecoCard">
              <span className="ecoCategory">Database &amp; Storage</span>
              <h4 className="ecoTitle">PostgreSQL &amp; Prisma</h4>
              <p className="ecoDesc">Atomic concurrency claims, tenant isolation, and relational audit logs.</p>
            </div>
            <div className="ecoCard">
              <span className="ecoCategory">CI/CD Pipelines</span>
              <h4 className="ecoTitle">GitHub Actions &amp; CLI</h4>
              <p className="ecoDesc">Automated regression evaluation gates exiting non-zero on policy breaches.</p>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Footer Banner */}
      <section className="landingCtaBanner">
        <div className="landingContainer">
          <div className="ctaContent">
            <h2 className="ctaTitle">Ready to Secure Your Autonomous Agents?</h2>
            <p className="ctaSubtitle">
              Deploy AgentReady as an enterprise control plane or run it locally in seconds with Docker.
            </p>
            <div className="ctaButtons">
              <Link href="/register" className="heroBtnPrimary">
                Get Started Now <span>→</span>
              </Link>
              <Link href="/login" className="heroBtnSecondary">
                Demo Sign In
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="landingFooter">
        <div className="landingContainer footerContainer">
          <div className="footerLeft">
            <div className="landingLogo small">AR</div>
            <span>AgentReady • Deterministic AI Governance &amp; Execution Control Plane</span>
          </div>
          <div className="footerLinks">
            <Link href="/login">Sign In</Link>
            <Link href="/register">Register</Link>
            <a href="https://github.com/Deadeye102000/Agentready" target="_blank" rel="noreferrer">
              GitHub
            </a>
            <a href="https://modelcontextprotocol.io" target="_blank" rel="noreferrer">
              MCP Spec
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
