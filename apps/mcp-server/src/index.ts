import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { fileURLToPath } from "node:url";
import path from "node:path";

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

// Start the server using Stdio transport
export async function runServer(transport?: any) {
  const actualTransport = transport ?? new StdioServerTransport();
  await server.connect(actualTransport);
  console.error("AgentReady MCP Server running on stdio");
  return server;
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
