import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { fileURLToPath } from "node:url";
import path from "node:path";
import http from "node:http";
import crypto from "node:crypto";

export interface McpServerConfig {
  apiUrl?: string;
  apiKey?: string;
}

export function createMcpServer(config: McpServerConfig = {}) {
  // Retrieve configuration from options or environment variables
  const getApiUrl = () =>
    config.apiUrl || process.env.AGENTREADY_API_URL || "http://localhost:3001";
  const getApiKey = () =>
    config.apiKey || process.env.AGENTREADY_API_KEY || process.env.AGENTREADY_AUTH_TOKEN;

  // Helper to make authenticated requests to AgentReady API via Bearer token
  async function fetchFromApi(apiPath: string, options: RequestInit = {}) {
    const apiKey = getApiKey();
    if (!apiKey) {
      throw new Error(
        "AGENTREADY_API_KEY is not set. Please provide a valid AgentReady API key in the environment."
      );
    }

    const baseUrl = getApiUrl();
    const cleanBase = baseUrl.endsWith("/") ? baseUrl.slice(0, -1) : baseUrl;
    const cleanPath = apiPath.startsWith("/") ? apiPath : `/${apiPath}`;
    const url = `${cleanBase}${cleanPath}`;

    const headers = new Headers(options.headers || {});
    headers.set("Authorization", `Bearer ${apiKey}`);
    if (!headers.has("Accept")) {
      headers.set("Accept", "application/json");
    }

    try {
      const response = await fetch(url, {
        method: "GET",
        ...options,
        headers
      });

      if (!response.ok) {
        throw new Error(`API returned status ${response.status}: ${response.statusText}`);
      }

      return await response.json();
    } catch (error: any) {
      throw new Error(`Failed to query AgentReady API at ${url}: ${error.message}`);
    }
  }

  // Instantiate the MCP Server
  const server = new Server(
    {
      name: "agentready-mcp-server",
      version: "0.1.0",
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );

  // Register Tool Definitions
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "list_available_tools",
        description:
          "Lists all allowed tools and governance capabilities configured across AgentReady task contracts, feature flags, and approval gates.",
        inputSchema: {
          type: "object",
          properties: {},
        },
      },
      {
        name: "list_task_contracts",
        description: "Lists all task contracts registered in the current organization.",
        inputSchema: {
          type: "object",
          properties: {},
        },
      },
      {
        name: "get_contract_context",
        description: "Retrieves the full context and criteria details for a specific task contract.",
        inputSchema: {
          type: "object",
          properties: {
            id: {
              type: "string",
              description: "The unique identifier of the task contract.",
            },
          },
          required: ["id"],
        },
      },
      {
        name: "get_execution_status",
        description: "Retrieves the current lifecycle status and metadata for a specific agent execution.",
        inputSchema: {
          type: "object",
          properties: {
            id: {
              type: "string",
              description: "The unique identifier of the agent execution.",
            },
          },
          required: ["id"],
        },
      },
      {
        name: "start_execution",
        description: "Starts a new agent execution with governance, feature flag, and approval gate checks. If risky, the execution is paused in WAITING_FOR_APPROVAL status and an approval request is generated.",
        inputSchema: {
          type: "object",
          properties: {
            projectId: {
              type: "string",
              description: "The unique identifier of the project."
            },
            agentId: {
              type: "string",
              description: "The unique identifier of the agent identity."
            },
            contractId: {
              type: "string",
              description: "The unique identifier of the task contract (optional but recommended to enforce allowed tools governance)."
            },
            taskId: {
              type: "string",
              description: "The unique identifier of the task (optional)."
            },
            objective: {
              type: "string",
              description: "The objective of the execution."
            },
            input: {
              type: "object",
              description: "Any custom input parameters for the execution (optional)."
            },
            riskScore: {
              type: "integer",
              description: "The estimated risk score (0-100, default: 0) of this execution (optional)."
            }
          },
          required: ["projectId", "agentId", "objective"]
        }
      }
    ],
  };
});

// Register Tool Invocation Handler
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case "list_available_tools": {
        // Collect capabilities/allowedTools from contracts, flags, and gates
        const [contracts, featureFlags, approvalGates] = await Promise.all([
          fetchFromApi("/api/v1/task-contracts").catch(() => []),
          fetchFromApi("/api/v1/feature-flags").catch(() => []),
          fetchFromApi("/api/v1/approval-gates").catch(() => []),
        ]);

        const toolsSet = new Set<string>();
        const details: Record<string, { sources: string[]; status?: string; gateMode?: string }> = {};

        // Helper to register tool occurrences
        const addTool = (toolName: string, source: string, extra?: Record<string, string>) => {
          toolsSet.add(toolName);
          if (!details[toolName]) {
            details[toolName] = { sources: [] };
          }
          if (!details[toolName].sources.includes(source)) {
            details[toolName].sources.push(source);
          }
          if (extra) {
            Object.assign(details[toolName], extra);
          }
        };

        // Extract from contracts
        if (Array.isArray(contracts)) {
          for (const contract of contracts) {
            if (Array.isArray(contract.allowedTools)) {
              for (const t of contract.allowedTools) {
                addTool(t, `TaskContract: ${contract.name} (v${contract.version})`);
              }
            }
          }
        }

        // Extract from feature flags
        if (Array.isArray(featureFlags)) {
          for (const flag of featureFlags) {
            addTool(flag.capability, "FeatureFlag", { status: flag.state });
          }
        }

        // Extract from approval gates
        if (Array.isArray(approvalGates)) {
          for (const gate of approvalGates) {
            addTool(gate.capability, "ApprovalGate", { gateMode: gate.mode });
          }
        }

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  availableTools: Array.from(toolsSet),
                  details,
                },
                null,
                2
              ),
            },
          ],
        };
      }

      case "list_task_contracts": {
        const contracts = await fetchFromApi("/api/v1/task-contracts");
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(contracts, null, 2),
            },
          ],
        };
      }

      case "get_contract_context": {
        if (!args || typeof args.id !== "string") {
          throw new Error("Missing or invalid 'id' argument.");
        }
        const contract = await fetchFromApi(`/api/v1/task-contracts/${args.id}`);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(contract, null, 2),
            },
          ],
        };
      }

      case "get_execution_status": {
        if (!args || typeof args.id !== "string") {
          throw new Error("Missing or invalid 'id' argument.");
        }
        const execution = await fetchFromApi(`/api/v1/executions/${args.id}`);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(execution, null, 2),
            },
          ],
        };
      }

      case "start_execution": {
        if (!args || typeof args.projectId !== "string" || typeof args.agentId !== "string" || typeof args.objective !== "string") {
          throw new Error("Missing or invalid required arguments: 'projectId', 'agentId', 'objective'.");
        }

        const body = {
          projectId: args.projectId,
          agentId: args.agentId,
          contractId: typeof args.contractId === "string" ? args.contractId : undefined,
          taskId: typeof args.taskId === "string" ? args.taskId : undefined,
          objective: args.objective,
          input: args.input && typeof args.input === "object" ? args.input : {},
          riskScore: typeof args.riskScore === "number" ? args.riskScore : 0,
          metadata: {
            source: "MCP",
            mcpTriggered: true,
            mcpTimestamp: new Date().toISOString()
          }
        };

        const result = await fetchFromApi("/api/v1/executions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify(body)
        });

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(result, null, 2)
            }
          ]
        };
      }

      default:
        throw new Error(`Tool not found: ${name}`);
    }
  } catch (error: any) {
    return {
      content: [
        {
          type: "text",
          text: `Error invoking tool ${name}: ${error.message}`,
        },
      ],
      isError: true,
    };
  }
  });

  return server;
}

export const server = createMcpServer();

export interface McpSseServerOptions extends McpServerConfig {
  port?: number;
  host?: string;
  maxConcurrentConnectionsPerKey?: number; // default 5
  maxHandshakesPerMinute?: number; // default 30
  sessionTokenTtlMs?: number; // default 30_000 (30s)
}

interface SseSessionToken {
  keyId: string;
  createdAt: number;
  expiresAt: number;
  used: boolean;
}

interface ActiveSseSession {
  transport: SSEServerTransport;
  rateLimitKey: string;
  authenticatedKey: string;
}

export function createSseHttpServer(options: McpSseServerOptions = {}): http.Server {
  const getExpectedApiKey = () =>
    options.apiKey || process.env.AGENTREADY_API_KEY || process.env.AGENTREADY_AUTH_TOKEN;

  const maxConcurrent = options.maxConcurrentConnectionsPerKey ?? 5;
  const maxHandshakes = options.maxHandshakesPerMinute ?? 30;
  const sessionTokenTtl = options.sessionTokenTtlMs ?? 30_000;

  const sessionTokens = new Map<string, SseSessionToken>();
  const activeConnections = new Map<string, number>();
  const handshakeTimestamps = new Map<string, number[]>();
  const activeTransports = new Map<string, ActiveSseSession>();

  // Periodically clean up expired session tokens
  const cleanupInterval = setInterval(() => {
    const now = Date.now();
    for (const [token, data] of sessionTokens.entries()) {
      if (now > data.expiresAt || data.used) {
        sessionTokens.delete(token);
      }
    }
  }, 10_000);
  cleanupInterval.unref();

  const corsHeaders: Record<string, string> = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Authorization, Content-Type, mcp-protocol-version, x-api-key",
  };

  const httpServer = http.createServer(async (req, res) => {
    try {
      const parsedUrl = new URL(req.url || "/", "http://localhost");
      const pathname = parsedUrl.pathname;

      if (req.method === "OPTIONS") {
        res.writeHead(204, corsHeaders);
        res.end();
        return;
      }

      // 1. Health check endpoint
      if (req.method === "GET" && pathname === "/health") {
        res.writeHead(200, {
          "Content-Type": "application/json",
          ...corsHeaders,
        });
        res.end(JSON.stringify({ status: "ok", transport: "sse" }));
        return;
      }

      // 2. Mint single-use SSE session token endpoint
      if (req.method === "POST" && pathname === "/sse/session") {
        const authHeader = req.headers["authorization"] || (req.headers["x-api-key"] as string);
        const bearerToken = authHeader?.startsWith("Bearer ")
          ? authHeader.slice(7).trim()
          : authHeader;

        const expectedKey = getExpectedApiKey();
        if (expectedKey && bearerToken !== expectedKey) {
          res.writeHead(401, {
            "Content-Type": "application/json",
            ...corsHeaders,
          });
          res.end(JSON.stringify({ error: "Unauthorized: Invalid or missing API key" }));
          return;
        }

        const sessionToken = "sse_sess_" + crypto.randomBytes(24).toString("hex");
        const now = Date.now();
        const expiresAt = now + sessionTokenTtl;

        sessionTokens.set(sessionToken, {
          keyId: bearerToken || "anonymous",
          createdAt: now,
          expiresAt,
          used: false,
        });

        res.writeHead(200, {
          "Content-Type": "application/json",
          ...corsHeaders,
        });
        res.end(
          JSON.stringify({
            sessionToken,
            expiresAt: new Date(expiresAt).toISOString(),
          })
        );
        return;
      }

      // 3. SSE Stream Connection Endpoint
      if (req.method === "GET" && pathname === "/sse") {
        // Query-string fallback for api_key is strictly prohibited
        if (parsedUrl.searchParams.has("api_key")) {
          res.writeHead(400, {
            "Content-Type": "application/json",
            ...corsHeaders,
          });
          res.end(
            JSON.stringify({
              error:
                "Long-lived API keys in query parameters are strictly forbidden. Use 'Authorization: Bearer <token>' header or mint a single-use session token via POST /sse/session.",
            })
          );
          return;
        }

        // Authenticate via Authorization header or single-use session token
        let authenticatedKey: string | null = null;
        const authHeader = req.headers["authorization"] || (req.headers["x-api-key"] as string);
        const bearerToken = authHeader?.startsWith("Bearer ")
          ? authHeader.slice(7).trim()
          : authHeader;

        const expectedKey = getExpectedApiKey();

        if (bearerToken) {
          if (expectedKey && bearerToken !== expectedKey) {
            res.writeHead(401, {
              "Content-Type": "application/json",
              ...corsHeaders,
            });
            res.end(JSON.stringify({ error: "Unauthorized: Invalid API key" }));
            return;
          }
          authenticatedKey = bearerToken;
        } else {
          const sessionTokenParam = parsedUrl.searchParams.get("session_token");
          if (sessionTokenParam) {
            const sessionData = sessionTokens.get(sessionTokenParam);
            const now = Date.now();
            if (!sessionData || sessionData.used || now > sessionData.expiresAt) {
              res.writeHead(401, {
                "Content-Type": "application/json",
                ...corsHeaders,
              });
              res.end(JSON.stringify({ error: "Invalid or expired session token" }));
              return;
            }

            // Consume single-use token immediately
            sessionData.used = true;
            sessionTokens.delete(sessionTokenParam);
            authenticatedKey = sessionData.keyId;
          }
        }

        if (!authenticatedKey && expectedKey) {
          res.writeHead(401, {
            "Content-Type": "application/json",
            ...corsHeaders,
          });
          res.end(
            JSON.stringify({
              error:
                "Unauthorized: Missing Authorization header or valid single-use session token",
            })
          );
          return;
        }

        const clientIp =
          (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() ||
          req.socket.remoteAddress ||
          "127.0.0.1";
        const rateLimitKey = authenticatedKey || clientIp;

        // Rate Limit 1: Concurrent connections
        const currentConns = activeConnections.get(rateLimitKey) || 0;
        if (currentConns >= maxConcurrent) {
          res.writeHead(429, {
            "Content-Type": "application/json",
            "Retry-After": "5",
            ...corsHeaders,
          });
          res.end(
            JSON.stringify({
              error: `Too many concurrent SSE connections. Maximum ${maxConcurrent} allowed.`,
            })
          );
          return;
        }

        // Rate Limit 2: Handshakes per minute
        const now = Date.now();
        const windowStart = now - 60_000;
        const recentHandshakes = (handshakeTimestamps.get(rateLimitKey) || []).filter(
          (t) => t > windowStart
        );
        if (recentHandshakes.length >= maxHandshakes) {
          res.writeHead(429, {
            "Content-Type": "application/json",
            "Retry-After": "60",
            ...corsHeaders,
          });
          res.end(
            JSON.stringify({
              error: `Rate limit exceeded. Maximum ${maxHandshakes} handshakes per minute.`,
            })
          );
          return;
        }
        recentHandshakes.push(now);
        handshakeTimestamps.set(rateLimitKey, recentHandshakes);

        // Track active connection
        activeConnections.set(rateLimitKey, currentConns + 1);

        const transport = new SSEServerTransport("/message", res);
        const sessionId = transport.sessionId;

        activeTransports.set(sessionId, {
          transport,
          rateLimitKey,
          authenticatedKey: authenticatedKey || "anonymous",
        });

        let cleanedUp = false;
        const cleanup = () => {
          if (cleanedUp) return;
          cleanedUp = true;
          activeTransports.delete(sessionId);
          const current = activeConnections.get(rateLimitKey) || 1;
          if (current <= 1) {
            activeConnections.delete(rateLimitKey);
          } else {
            activeConnections.set(rateLimitKey, current - 1);
          }
        };

        res.on("close", cleanup);
        transport.onclose = cleanup;

        const clientServer = createMcpServer({
          apiUrl: options.apiUrl,
          apiKey: authenticatedKey || options.apiKey,
        });

        await clientServer.connect(transport);
        return;
      }

      // 4. JSON-RPC Message Endpoint
      if (req.method === "POST" && pathname === "/message") {
        // Query-string fallback for api_key is strictly prohibited
        if (parsedUrl.searchParams.has("api_key")) {
          res.writeHead(400, {
            "Content-Type": "application/json",
            ...corsHeaders,
          });
          res.end(
            JSON.stringify({
              error:
                "Long-lived API keys in query parameters are strictly forbidden. Use Authorization header.",
            })
          );
          return;
        }

        const sessionId = parsedUrl.searchParams.get("sessionId");
        if (!sessionId) {
          res.writeHead(400, {
            "Content-Type": "application/json",
            ...corsHeaders,
          });
          res.end(JSON.stringify({ error: "Missing sessionId query parameter" }));
          return;
        }

        const sessionRecord = activeTransports.get(sessionId);
        if (!sessionRecord) {
          res.writeHead(404, {
            "Content-Type": "application/json",
            ...corsHeaders,
          });
          res.end(JSON.stringify({ error: "Session not found or connection terminated" }));
          return;
        }

        // Require Authorization header on POST /message
        const authHeader = req.headers["authorization"] || (req.headers["x-api-key"] as string);
        const bearerToken = authHeader?.startsWith("Bearer ")
          ? authHeader.slice(7).trim()
          : authHeader;

        const expectedKey = getExpectedApiKey();
        if (expectedKey) {
          if (!bearerToken || (bearerToken !== expectedKey && bearerToken !== sessionRecord.authenticatedKey)) {
            res.writeHead(401, {
              "Content-Type": "application/json",
              ...corsHeaders,
            });
            res.end(
              JSON.stringify({
                error: "Unauthorized: Invalid or missing Authorization header on /message",
              })
            );
            return;
          }
        }

        await sessionRecord.transport.handlePostMessage(req, res);
        return;
      }

      // 404 for unknown endpoints
      res.writeHead(404, {
        "Content-Type": "application/json",
        ...corsHeaders,
      });
      res.end(JSON.stringify({ error: "Not Found" }));
    } catch (err: any) {
      if (!res.headersSent) {
        res.writeHead(500, {
          "Content-Type": "application/json",
          ...corsHeaders,
        });
        res.end(JSON.stringify({ error: err.message || "Internal Server Error" }));
      }
    }
  });

  return httpServer;
}

// Start the server using Stdio or SSE transport
export async function runServer(options?: McpSseServerOptions & { transport?: "stdio" | "sse" }) {
  const args = process.argv.slice(2);
  const transportArg = args.find((a) => a.startsWith("--transport="))?.split("=")[1];
  const portArg = args.find((a) => a.startsWith("--port="))?.split("=")[1];
  const hostArg = args.find((a) => a.startsWith("--host="))?.split("=")[1];

  const chosenTransport =
    options?.transport ||
    transportArg ||
    (process.env.MCP_TRANSPORT === "sse" ? "sse" : "stdio");

  if (chosenTransport === "sse") {
    const port =
      options?.port ||
      (portArg ? parseInt(portArg, 10) : undefined) ||
      (process.env.MCP_PORT ? parseInt(process.env.MCP_PORT, 10) : 3002);
    const host = options?.host || hostArg || process.env.MCP_HOST || "0.0.0.0";

    const sseHttpServer = createSseHttpServer({
      ...options,
      port,
      host,
    });

    await new Promise<void>((resolve, reject) => {
      sseHttpServer.listen(port, host, () => {
        console.error(
          `AgentReady MCP Server running on SSE transport at http://${host}:${port}`
        );
        resolve();
      });
      sseHttpServer.on("error", reject);
    });

    return sseHttpServer;
  } else {
    const actualTransport = new StdioServerTransport();
    await server.connect(actualTransport);
    console.error("AgentReady MCP Server running on stdio");
    return server;
  }
}

const isDirectExecution = () => {
  if (!process.argv[1]) return false;
  try {
    const currentFile = fileURLToPath(import.meta.url);
    const invokedFile = path.resolve(process.argv[1]);
    return currentFile === invokedFile;
  } catch {
    return false;
  }
};

if (isDirectExecution()) {
  runServer().catch((error) => {
    console.error("Failed to start AgentReady MCP Server:", error);
    process.exit(1);
  });
}

