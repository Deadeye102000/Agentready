# AgentReady Model Context Protocol (MCP) Server

This is the Model Context Protocol (MCP) server for **AgentReady**, providing a secure gateway for AI agents to query AgentReady task contracts, verify available tools, inspect execution states, and trigger governed executions.

## Setup & Configuration

The MCP server connects to your running AgentReady API instance via standard HTTP machine authentication (`Authorization: Bearer <api_key>`).

### Environment Variables

- `AGENTREADY_API_URL`: The base URL of the AgentReady backend API. Defaults to `http://localhost:3001`.
- `AGENTREADY_API_KEY`: A valid AgentReady API key (prefixed with `ar_live_` for production or `ar_test_` for testing). The key is transmitted via the standard `Authorization: Bearer <api_key>` header to authenticate against the AgentReady machine authentication layer.

> **Note**: Previous versions used an undocumented `AGENTREADY_AUTH_TOKEN` session cookie prefix. This has been replaced by standard Bearer API key authentication. `AGENTREADY_AUTH_TOKEN` remains supported only as an environment fallback alias for `AGENTREADY_API_KEY`.

### Required API Key Scopes

Ensure the API key issued to the agent possesses the appropriate scopes for the tools it needs to execute:

| Scope | Required For Tools | Description |
|:---|:---|:---|
| `contracts:read` | `list_task_contracts`, `get_contract_context`, `list_available_tools` | Query organization task contracts and criteria |
| `governance:read` | `list_available_tools` | Query feature flags and approval gates |
| `executions:read` | `get_execution_status` | Query status and details of agent executions |
| `executions:write` | `start_execution` | Initiate new governed agent executions |

*Tip: For development or administrative agent runners, API keys with wildcard scopes (e.g. `contracts:*`, `governance:*`, `executions:*`) or the `all` / `admin` scope can be used.*

## How to Run

### Development Mode

Run the MCP server in watch mode:

```bash
pnpm --filter @agentready/mcp-server dev
```

### Build & Run Production Bundle

1. Build the TypeScript code:
   ```bash
   pnpm --filter @agentready/mcp-server build
   ```

2. Run the compiled JavaScript:
   ```bash
   node dist/index.js
   ```

## Integration with MCP Clients (e.g. Claude Desktop)

To connect Claude Desktop or any MCP-compatible agent client, add the following configuration to your `claude_desktop_config.json` file (e.g., `~/Library/Application Support/Claude/claude_desktop_config.json` on macOS):

```json
{
  "mcpServers": {
    "agentready": {
      "command": "node",
      "args": ["/absolute/path/to/Agentready/apps/mcp-server/dist/index.js"],
      "env": {
        "AGENTREADY_API_URL": "http://localhost:3001",
        "AGENTREADY_API_KEY": "ar_live_your_agentready_api_key_here"
      }
    }
  }
}
```

## Exposed Tools

This server exposes the following tools:

### 1. `list_available_tools`
Lists all allowed tools and governance capabilities configured across AgentReady task contracts, feature flags, and approval gates.
- **Arguments**: None

### 2. `list_task_contracts`
Lists all task contracts registered in the current organization.
- **Arguments**: None

### 3. `get_contract_context`
Retrieves the full context and criteria details for a specific task contract.
- **Arguments**:
  - `id` (string, required): The unique identifier of the task contract.

### 4. `get_execution_status`
Retrieves the current lifecycle status and metadata for a specific agent execution.
- **Arguments**:
  - `id` (string, required): The unique identifier of the agent execution.

### 5. `start_execution`
Starts a new agent execution with governance, feature flag, and approval gate checks. If risky, the execution is paused in `WAITING_FOR_APPROVAL` status and an approval request is generated.
- **Arguments**:
  - `projectId` (string, required): The unique identifier of the project.
  - `agentId` (string, required): The unique identifier of the agent identity.
  - `objective` (string, required): The objective of the execution.
  - `contractId` (string, optional): The unique identifier of the task contract.
  - `taskId` (string, optional): The unique identifier of the task.
  - `input` (object, optional): Custom input parameters for the execution.
  - `riskScore` (integer, optional): The estimated risk score (0-100, default: 0).
