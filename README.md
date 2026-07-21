# AgentReady

AgentReady is an agent-first SaaS workspace. This repository is currently only the monorepo scaffold; product features are intentionally not implemented yet.

## Structure

- `apps/web` - Next.js web app
- `apps/api` - Fastify API app
- `apps/mcp-server` - future MCP server app scaffold
- `packages/db` - Prisma/database package
- `packages/shared` - shared TypeScript utilities and types
- `packages/auth` - future auth package scaffold
- `packages/agent-contracts` - future agent-facing contracts package scaffold
- `prisma` - Prisma schema root
- `docs` - project documentation

## Local Setup

1. Install pnpm if needed:

   ```sh
   npm install -g pnpm
   ```

2. Install dependencies:

   ```sh
   pnpm install
   ```

3. Copy environment variables:

   ```sh
   cp .env.example .env
   ```

4. Start PostgreSQL:

   ```sh
   docker compose up -d postgres
   ```

5. Generate Prisma Client:

   ```sh
   pnpm db:generate
   ```

6. Start web and API development servers:

   ```sh
   pnpm dev
   ```

## Validation

Run:

```sh
pnpm typecheck
pnpm build
```
