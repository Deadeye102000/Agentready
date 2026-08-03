# AgentReady Model Context Protocol (MCP) Server

This is the Model Context Protocol (MCP) server for **AgentReady**, providing a secure, read-only gateway to query AgentReady task contracts, executions, and available tools.

## Setup & Configuration

The MCP server connects to your running AgentReady API instance. It requires the following environment variables:

- `AGENTREADY_API_URL`: The base URL of the AgentReady backend API. Defaults to `http://localhost:3001`.
- `AGENTREADY_AUTH_TOKEN`: The session authentication token (`agentready_session` cookie value) to query the organization's endpoints.

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

To expose these read-only tools to Claude Desktop, add the following configuration to your `claude_desktop_config.json` file (typically located at `~/Library/Application Support/Claude/claude_desktop_config.json` on macOS):

```json
{
  "mcpServers": {
    "agentready": {
      "command": "node",
      "args": ["/absolute/path/to/Agentready/apps/mcp-server/dist/index.js"],
      "env": {
        "AGENTREADY_API_URL": "http://localhost:3001",
        "AGENTREADY_AUTH_TOKEN": "YOUR_AGENTREADY_SESSION_TOKEN"
      }
    }
  }
}
```

## Exposed Read-Only Tools

This server exposes the following safe, read-only tools:

### 1. `list_available_tools`
Lists all allowed tools and governance capabilities configured across task contracts, feature flags, and approval gates.
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
