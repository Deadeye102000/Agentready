import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import path from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { createMcpServer } from "../src/index.js";

describe("AgentReady MCP Server Integration Tests", () => {
  let mockApiServer: http.Server;
  let apiUrl: string;
  const testApiKey = "ar_live_mcp_test_api_key_123456789";
  const recordedRequests: Array<{
    url?: string;
    method?: string;
    headers: http.IncomingHttpHeaders;
  }> = [];

  before(async () => {
    mockApiServer = http.createServer((req, res) => {
      recordedRequests.push({
        url: req.url,
        method: req.method,
        headers: req.headers
      });

      // Verify Authorization: Bearer <api_key> header
      const authHeader = req.headers["authorization"];
      if (!authHeader || authHeader !== `Bearer ${testApiKey}`) {
        res.writeHead(401, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Unauthorized: Invalid or missing Bearer token" }));
        return;
      }

      if (req.url === "/api/v1/task-contracts" && req.method === "GET") {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify([
            {
              id: "contract-1",
              name: "Customer Support Automation",
              version: 1,
              allowedTools: ["knowledge_base_search", "escalate_ticket"]
            }
          ])
        );
        return;
      }

      if (req.url === "/api/v1/feature-flags" && req.method === "GET") {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify([
            { id: "ff-1", capability: "knowledge_base_search", state: "ENABLED" }
          ])
        );
        return;
      }

      if (req.url === "/api/v1/approval-gates" && req.method === "GET") {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify([
            { id: "gate-1", capability: "escalate_ticket", mode: "REQUIRE_APPROVAL" }
          ])
        );
        return;
      }

      if (req.url?.startsWith("/api/v1/task-contracts/") && req.method === "GET") {
        const id = req.url.split("/").pop();
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            id,
            name: "Customer Support Automation",
            version: 1,
            allowedTools: ["knowledge_base_search", "escalate_ticket"]
          })
        );
        return;
      }

      if (req.url === "/api/v1/executions" && req.method === "POST") {
        res.writeHead(201, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ id: "exec-999", status: "RUNNING" }));
        return;
      }

      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Not Found" }));
    });

    await new Promise<void>((resolve) => {
      mockApiServer.listen(0, "127.0.0.1", () => {
        const addr = mockApiServer.address() as any;
        apiUrl = `http://127.0.0.1:${addr.port}`;
        resolve();
      });
    });
  });

  after(async () => {
    if (mockApiServer) {
      await new Promise<void>((resolve) => mockApiServer.close(() => resolve()));
    }
  });

  it("authenticates via Authorization: Bearer <api_key> without cookie prefix and executes tool call successfully", async () => {
    recordedRequests.length = 0;

    // 1. Create server with API key configuration
    const mcpServer = createMcpServer({
      apiUrl,
      apiKey: testApiKey
    });

    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await mcpServer.connect(serverTransport);

    const client = new Client(
      { name: "test-client", version: "1.0.0" },
      { capabilities: {} }
    );
    await client.connect(clientTransport);

    // 2. Call list_task_contracts tool
    const result = await client.callTool({
      name: "list_task_contracts",
      arguments: {}
    });

    assert.equal(result.isError, undefined);
    assert.ok(Array.isArray(result.content));
    assert.equal(result.content[0].type, "text");
    assert.ok(result.content[0].text.includes("Customer Support Automation"));

    // 3. Verify that the request sent to the API had Authorization Bearer and NO cookie header
    const contractReq = recordedRequests.find((r) => r.url === "/api/v1/task-contracts");
    assert.ok(contractReq, "API should have received /api/v1/task-contracts request");
    assert.equal(contractReq.headers["authorization"], `Bearer ${testApiKey}`);
    assert.equal(contractReq.headers["cookie"], undefined, "Must NOT send raw session cookie");

    await client.close();
  });

  it("spawns MCP server as stdio subprocess with AGENTREADY_API_KEY and successfully lists available tools", async () => {
    recordedRequests.length = 0;

    const stdioTransport = new StdioClientTransport({
      command: "npx",
      args: ["tsx", path.resolve(import.meta.dirname, "../src/index.ts")],
      env: {
        ...process.env,
        AGENTREADY_API_URL: apiUrl,
        AGENTREADY_API_KEY: testApiKey
      }
    });

    const client = new Client(
      { name: "stdio-test-client", version: "1.0.0" },
      { capabilities: {} }
    );
    await client.connect(stdioTransport);

    // Call list_available_tools
    const result = await client.callTool({
      name: "list_available_tools",
      arguments: {}
    });

    assert.equal(result.isError, undefined);
    assert.ok(Array.isArray(result.content));
    const parsed = JSON.parse(result.content[0].text);
    assert.ok(parsed.availableTools.includes("knowledge_base_search"));
    assert.ok(parsed.availableTools.includes("escalate_ticket"));

    // Verify all 3 endpoints were requested with Bearer header
    const authHeaders = recordedRequests.map((r) => r.headers["authorization"]);
    assert.ok(authHeaders.length >= 3);
    for (const h of authHeaders) {
      assert.equal(h, `Bearer ${testApiKey}`);
    }

    // Verify no cookie was sent in any request
    for (const r of recordedRequests) {
      assert.equal(r.headers["cookie"], undefined);
    }

    await client.close();
  });

  it("returns error when AGENTREADY_API_KEY is not set", async () => {
    const unauthenticatedServer = createMcpServer({
      apiUrl,
      apiKey: "" // Explicitly empty
    });

    // Clear env vars to simulate completely missing key
    const prevKey = process.env.AGENTREADY_API_KEY;
    const prevToken = process.env.AGENTREADY_AUTH_TOKEN;
    delete process.env.AGENTREADY_API_KEY;
    delete process.env.AGENTREADY_AUTH_TOKEN;

    try {
      const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
      await unauthenticatedServer.connect(serverTransport);

      const client = new Client(
        { name: "test-client", version: "1.0.0" },
        { capabilities: {} }
      );
      await client.connect(clientTransport);

      const result = await client.callTool({
        name: "list_task_contracts",
        arguments: {}
      });

      assert.equal(result.isError, true);
      assert.ok(result.content[0].text.includes("AGENTREADY_API_KEY is not set"));

      await client.close();
    } finally {
      if (prevKey) process.env.AGENTREADY_API_KEY = prevKey;
      if (prevToken) process.env.AGENTREADY_AUTH_TOKEN = prevToken;
    }
  });
});
