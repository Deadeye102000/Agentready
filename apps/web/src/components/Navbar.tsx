"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function Navbar({ orgName }: { orgName?: string }) {
  const pathname = usePathname();

  const navItems = [
    { label: "Overview", href: "/" },
    { label: "Task Contracts", href: "/task-contracts" },
    { label: "Executions", href: "/executions" },
    { label: "Traces", href: "/traces" },
    { label: "Approval Queue", href: "/approval-queue" },
    { label: "Feature Flags", href: "/feature-flags" },
    { label: "Audit Logs", href: "/audit-logs" },
    { label: "API Keys", href: "/api-keys" },
    { label: "Evals", href: "/evals" },
    { label: "MCP", href: "/mcp" }
  ];

  return (
    <header className="navbar">
      <div className="navbarTop">
        <div className="brandGroup">
          <div className="brandLogo">AR</div>
          <div>
            <span className="brandName">AgentReady</span>
            <span className="brandBadge">AI Agent Governance</span>
          </div>
        </div>
        <div className="orgBadge">{orgName ?? "No Organization"}</div>
      </div>
      <nav className="navBarList">
        {navItems.map((item) => {
          const isActive = pathname === item.href || (item.href !== "/" && pathname?.startsWith(item.href));
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`navItem ${isActive ? "active" : ""}`}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>
    </header>
  );
}
