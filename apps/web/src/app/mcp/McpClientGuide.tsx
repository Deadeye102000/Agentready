"use client";

import { useState } from "react";
import Link from "next/link";

const CLIENT_CONFIGS = {
  claude: {
    title: "Claude Desktop",
    path: "~/Library/Application Support/Claude/claude_desktop_config.json",
    snippet: `{
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
}`
  },
  cursor: {
    title: "Cursor IDE",
    path: ".cursor/mcp.json (or Cursor Settings > Features > MCP)",
    snippet: `{
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
}`
  },
  windsurf: {
    title: "Windsurf / Cascade",
    path: "~/.codeium/windsurf/mcp_config.json",
    snippet: `{
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
}`
  },
  node: {
    title: "Custom Agent SDK",
    path: "Autonomous Agent Script (TypeScript/JavaScript)",
    snippet: `import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const transport = new StdioClientTransport({
  command: "node",
  args: ["./apps/mcp-server/dist/index.js"],
  env: {
    AGENTREADY_API_URL: "http://localhost:3001",
    AGENTREADY_API_KEY: process.env.AGENTREADY_API_KEY
  }
});

const client = new Client({ name: "my-autonomous-agent", version: "1.0.0" });
await client.connect(transport);

// Call AgentReady governance tools
const contracts = await client.callTool({ name: "list_task_contracts", arguments: {} });`
  }
};

export function McpClientGuide() {
  const [activeClient, setActiveClient] = useState<keyof typeof CLIENT_CONFIGS>("claude");
  const [copied, setCopied] = useState(false);

  const config = CLIENT_CONFIGS[activeClient];

  const handleCopy = () => {
    navigator.clipboard.writeText(config.snippet);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="guideCard">
      <div className="guideHeader">
        <div>
          <h3 className="guideTitle">Client Connection Setup</h3>
          <p className="guideSubtitle">
            Connect desktop assistants, Cursor, or autonomous scripts directly to the AgentReady MCP governance gateway.
          </p>
        </div>

        <Link href="/api-keys" className="apiKeyCtaBtn">
          🔑 Generate Scoped API Key →
        </Link>
      </div>

      {/* Tabs */}
      <div className="clientTabs">
        {(Object.keys(CLIENT_CONFIGS) as Array<keyof typeof CLIENT_CONFIGS>).map(key => (
          <button
            key={key}
            onClick={() => setActiveClient(key)}
            className={`clientTab ${activeClient === key ? "active" : ""}`}
          >
            {CLIENT_CONFIGS[key].title}
          </button>
        ))}
      </div>

      {/* Code Snippet Box */}
      <div className="codeContainer">
        <div className="codeHeader">
          <span className="configPath">Config Location: <code>{config.path}</code></span>
          <button onClick={handleCopy} className="copyBtn">
            {copied ? "✓ Copied to Clipboard!" : "📋 Copy Snippet"}
          </button>
        </div>
        <pre className="codePre">{config.snippet}</pre>
      </div>

      <style jsx>{`
        .guideCard {
          background: #ffffff;
          border: 1px solid #e2e8f0;
          border-radius: 12px;
          padding: 24px;
          display: flex;
          flex-direction: column;
          gap: 18px;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04);
        }

        .guideHeader {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 16px;
          flex-wrap: wrap;
        }

        .guideTitle {
          margin: 0;
          font-size: 1.15rem;
          font-weight: 800;
          color: #0f172a;
        }

        .guideSubtitle {
          margin: 4px 0 0;
          font-size: 0.88rem;
          color: #64748b;
          max-width: 600px;
        }

        .apiKeyCtaBtn {
          background: #eff6ff;
          color: #2563eb;
          border: 1px solid #bfdbfe;
          padding: 8px 16px;
          border-radius: 6px;
          font-size: 0.85rem;
          font-weight: 700;
          text-decoration: none;
          transition: all 0.15s ease;
          white-space: nowrap;
        }

        .apiKeyCtaBtn:hover {
          background: #2563eb;
          color: #ffffff;
        }

        .clientTabs {
          display: flex;
          gap: 8px;
          border-bottom: 1px solid #e2e8f0;
          padding-bottom: 8px;
          overflow-x: auto;
        }

        .clientTab {
          background: none;
          border: 1px solid transparent;
          padding: 8px 16px;
          border-radius: 6px;
          font-size: 0.85rem;
          font-weight: 600;
          color: #64748b;
          cursor: pointer;
          white-space: nowrap;
          transition: all 0.15s ease;
        }

        .clientTab:hover {
          background: #f1f5f9;
          color: #0f172a;
        }

        .clientTab.active {
          background: #0f172a;
          color: #ffffff;
        }

        .codeContainer {
          border: 1px solid #1e293b;
          border-radius: 8px;
          overflow: hidden;
          background: #0f172a;
        }

        .codeHeader {
          padding: 10px 14px;
          background: #1e293b;
          display: flex;
          align-items: center;
          justify-content: space-between;
          flex-wrap: wrap;
          gap: 10px;
        }

        .configPath {
          font-size: 0.78rem;
          color: #94a3b8;
        }

        .configPath code {
          color: #e2e8f0;
        }

        .copyBtn {
          background: #334155;
          border: none;
          color: #f8fafc;
          padding: 5px 12px;
          border-radius: 4px;
          font-size: 0.75rem;
          font-weight: 600;
          cursor: pointer;
          transition: background 0.15s ease;
        }

        .copyBtn:hover {
          background: #475569;
        }

        .codePre {
          margin: 0;
          padding: 16px;
          color: #a5f3fc;
          font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
          font-size: 0.82rem;
          line-height: 1.5;
          overflow-x: auto;
        }
      `}</style>
    </div>
  );
}
