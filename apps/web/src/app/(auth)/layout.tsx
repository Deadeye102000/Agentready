import type { ReactNode } from "react";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="authWrapper">
      <div className="authContainer">
        <div className="authHeader">
          <div className="authLogo">AR</div>
          <h1 className="authTitle">AgentReady</h1>
          <p className="authSubtitle">Enterprise Governance for AI Agents</p>
        </div>
        <div className="authCard">{children}</div>
      </div>
    </div>
  );
}
