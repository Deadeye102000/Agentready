import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { createSseHttpServer } from "../src/index.js";

describe("AgentReady MCP Server SSE Transport Tests", () => {
  let mockApiServer: http.Server;
  let sseServer: http.Server;
  let apiUrl: string;
  let sseUrl: string;
  const testApiKey = "ar_live_sse_test_key_987654321";

  before(async () => {
    // 1. Start mock AgentReady API server
    mockApiServer = http.createServer((req, res) => {
      const authHeader = req.headers["authorization"];
      if (!authHeader || authHeader !== `Bearer ${testApiKey}`) {
        res.writeHead(401, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Unauthorized" }));
        return;
      }

      if (req.url === "/api/v1/task-contracts") {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify([
            {
              id: "contract-1",
              name: "Customer Support Automation",
              version: 1,
              allowedTools: ["knowledge_base_search"],
            },
          ])
        );
        return;
      }

      if (req.url === "/api/v1/feature-flags") {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify([
            { id: "ff-1", capability: "knowledge_base_search", state: "ENABLED" },
          ])
        );
        return;
      }

      res.writeHead(404);
      res.end();
    });

    await new Promise<void>((resolve) => {
      mockApiServer.listen(0, "127.0.0.1", resolve);
    });
    const apiPort = (mockApiServer.address() as any).port;
    apiUrl = `http://127.0.0.1:${apiPort}`;

    // 2. Start MCP SSE HTTP server
    sseServer = createSseHttpServer({
      apiUrl,
      apiKey: testApiKey,
      maxConcurrentConnectionsPerKey: 3,
      maxHandshakesPerMinute: 10,
      sessionTokenTtlMs: 2000,
    });

    await new Promise<void>((resolve) => {
      sseServer.listen(0, "127.0.0.1", resolve);
    });
    const ssePort = (sseServer.address() as any).port;
    sseUrl = `http://127.0.0.1:${ssePort}`;
  });

  after(async () => {
    await new Promise<void>((resolve) => sseServer.close(() => resolve()));
    await new Promise<void>((resolve) => mockApiServer.close(() => resolve()));
  });

  it("returns 200 on GET /health", async () => {
    const res = await fetch(`${sseUrl}/health`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.status, "ok");
    assert.equal(body.transport, "sse");
  });

  it("strictly rejects ?api_key= in query string with 400 Bad Request on GET /sse", async () => {
    const res = await fetch(`${sseUrl}/sse?api_key=${testApiKey}`);
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.match(body.error, /Long-lived API keys in query parameters are strictly forbidden/);
  });

  it("strictly rejects ?api_key= in query string with 400 Bad Request on POST /message", async () => {
    const res = await fetch(`${sseUrl}/message?api_key=${testApiKey}&sessionId=test`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.match(body.error, /Long-lived API keys in query parameters are strictly forbidden/);
  });

  it("rejects unauthenticated requests on GET /sse with 401 Unauthorized", async () => {
    const res = await fetch(`${sseUrl}/sse`);
    assert.equal(res.status, 401);
    const body = await res.json();
    assert.match(body.error, /Unauthorized/);
  });

  it("mints a single-use session token via POST /sse/session with Authorization header", async () => {
    // Unauthenticated request should fail
    const unauthRes = await fetch(`${sseUrl}/sse/session`, {
      method: "POST",
    });
    assert.equal(unauthRes.status, 401);

    // Authenticated request
    const res = await fetch(`${sseUrl}/sse/session`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${testApiKey}`,
      },
    });
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.ok(data.sessionToken);
    assert.ok(data.sessionToken.startsWith("sse_sess_"));
    assert.ok(data.expiresAt);

    // Use token to connect to /sse
    const connectRes = await fetch(`${sseUrl}/sse?session_token=${data.sessionToken}`);
    assert.equal(connectRes.status, 200);
    assert.equal(connectRes.headers.get("content-type"), "text/event-stream");

    // Immediately cancel stream
    await connectRes.body?.cancel();

    // Reusing the same session token must fail with 401 (single-use enforcement)
    const reuseRes = await fetch(`${sseUrl}/sse?session_token=${data.sessionToken}`);
    assert.equal(reuseRes.status, 401);
    const reuseBody = await reuseRes.json();
    assert.match(reuseBody.error, /Invalid or expired session token/);
  });

  it("connects directly to GET /sse with Authorization: Bearer <key> header and receives endpoint event", async () => {
    const res = await fetch(`${sseUrl}/sse`, {
      headers: {
        Authorization: `Bearer ${testApiKey}`,
      },
    });

    assert.equal(res.status, 200);
    assert.equal(res.headers.get("content-type"), "text/event-stream");

    // Read initial stream data to verify the endpoint event
    const reader = res.body!.getReader();
    const decoder = new TextDecoder();
    let chunkText = "";

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      chunkText += decoder.decode(value, { stream: true });
      if (chunkText.includes("event: endpoint")) {
        break;
      }
    }

    assert.ok(chunkText.includes("event: endpoint"));
    assert.ok(chunkText.includes("/message?sessionId="));

    await reader.cancel();
  });

  it("enforces concurrent connection limit on GET /sse (429 Too Many Requests)", async () => {
    // Our sseServer is configured with maxConcurrentConnectionsPerKey = 3
    const activeStreams: Array<{ cancel: () => Promise<void> }> = [];

    try {
      for (let i = 0; i < 3; i++) {
        const res = await fetch(`${sseUrl}/sse`, {
          headers: {
            Authorization: `Bearer ${testApiKey}`,
          },
        });
        assert.equal(res.status, 200);
        const reader = res.body!.getReader();
        activeStreams.push({ cancel: () => reader.cancel() });
      }

      // 4th connection should exceed limit of 3
      const limitRes = await fetch(`${sseUrl}/sse`, {
        headers: {
          Authorization: `Bearer ${testApiKey}`,
        },
      });
      assert.equal(limitRes.status, 429);
      assert.equal(limitRes.headers.get("retry-after"), "5");
      const limitBody = await limitRes.json();
      assert.match(limitBody.error, /Too many concurrent SSE connections/);
    } finally {
      // Clean up active streams
      for (const stream of activeStreams) {
        await stream.cancel();
      }
      // Wait for close callbacks
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  });

  it("completes full MCP protocol tool call over SSE and /message", async () => {
    const res = await fetch(`${sseUrl}/sse`, {
      headers: {
        Authorization: `Bearer ${testApiKey}`,
      },
    });
    assert.equal(res.status, 200);

    const reader = res.body!.getReader();
    const decoder = new TextDecoder();
    let initialChunk = "";

    while (!initialChunk.includes("event: endpoint")) {
      const { value } = await reader.read();
      initialChunk += decoder.decode(value, { stream: true });
    }

    // Extract endpoint path and sessionId
    const match = initialChunk.match(/data:\s*([^\r\n]+)/);
    assert.ok(match, "Expected data line in endpoint event");
    const endpointPath = match[1].trim();
    assert.ok(endpointPath.startsWith("/message?sessionId="));

    // Send initialize request to POST /message
    const initPayload = {
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2024-11-05",
        capabilities: {},
        clientInfo: { name: "test-client", version: "1.0.0" },
      },
    };

    const postRes = await fetch(`${sseUrl}${endpointPath}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${testApiKey}`,
      },
      body: JSON.stringify(initPayload),
    });
    assert.equal(postRes.status, 202); // Accepted

    // Read SSE stream for initialize response
    let responseText = "";
    while (!responseText.includes('"jsonrpc"')) {
      const { value } = await reader.read();
      responseText += decoder.decode(value, { stream: true });
    }

    assert.ok(responseText.includes('"jsonrpc":"2.0"'));
    assert.ok(responseText.includes('"id":1'));
    assert.ok(responseText.includes("agentready-mcp-server"));

    await reader.cancel();
  });
});
