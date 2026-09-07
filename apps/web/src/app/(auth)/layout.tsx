import type { ReactNode } from "react";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="authWrapper">
      <div className="authContainer">
        <div className="authHeader">
          <div style={{ display: "inline-flex", alignItems: "center", gap: "6px", background: "rgba(14, 165, 233, 0.1)", border: "1px solid rgba(14, 165, 233, 0.25)", borderRadius: "999px", padding: "3px 12px", fontSize: "0.72rem", color: "#38bdf8", fontWeight: "600", marginBottom: "4px" }}>
            <span style={{ width: "6px", height: "6px", borderRadius: "50%", background: "#22c55e", boxShadow: "0 0 8px #22c55e" }} />
            Control Plane Gateway
          </div>
          <div className="authLogo">AR</div>
          <h1 className="authTitle">AgentReady</h1>
          <p className="authSubtitle">Deterministic Execution, Immutability &amp; Risk Guardrails</p>
        </div>
        <div className="authCard">{children}</div>
      </div>
    </div>
  );
}
