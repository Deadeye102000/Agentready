# AgentReady Production Deployment Guide

This guide provides a comprehensive checklist and instructions for preparing, configuring, and deploying the AgentReady monorepo (`apps/api` and `apps/web`) to staging and production environments.

---

## 1. Environment Configuration

You must set up the following environment variables on your deployment host (or inside your container orchestrator like Kubernetes, ECS, or Vercel/Render).

### A. Fastify Backend (`apps/api`)

| Variable | Required | Recommended Production Value | Description |
|:---|:---:|:---|:---|
| `NODE_ENV` | Yes | `"production"` | Enables production optimizations, stricter security headers, and secure cookie configurations. |
| `DATABASE_URL` | Yes | `"postgresql://<user>:<password>@<host>:5432/<db>?sslmode=require"` | Production PostgreSQL database connection string. |
| `AUTH_SESSION_SECRET` | Yes | A random, unique 32+ character string (e.g. generated via `openssl rand -hex 32`) | Secret key used to sign and verify HMAC session cookies. **Do not use the development default.** |
| `API_CORS_ORIGINS` | Yes | `"https://dashboard.agentready.com"` (comma-separated if multiple) | The origin URL(s) of the live frontend dashboard. Wildcards (`*`) are disallowed because credentialed auth cookies are enabled. |
| `API_HOST` | No | `"0.0.0.0"` | Host boundary interface to bind the API server. |
| `API_PORT` | No | `3001` | Network port for incoming REST and WebSocket API requests. |
| `SENTRY_DSN` | No | `"https://<key>@sentry.io/<project>"` | DSN URL for forwarding unexpected 500 error logs to Sentry for monitoring. |
| `AGENT_RUNNER_WEBHOOK_URL` | Yes (for async background execution) | `"https://runner.internal/webhook"` | Target HTTP POST webhook endpoint invoked by the background execution runner when claiming an agent execution. If not configured, claimed executions fail immediately and loudly across all environments with `CONFIG_ERROR: AGENT_RUNNER_WEBHOOK_URL is not configured`. |

### B. Next.js Dashboard (`apps/web`)

| Variable | Required | Recommended Production Value | Description |
|:---|:---:|:---|:---|
| `NEXT_PUBLIC_AGENTREADY_API_URL` | Yes | `"https://api.agentready.com"` | Publicly accessible URL of the backend API. Used by the browser client to fetch dashboard metrics. |
| `PORT` (or `WEB_PORT`) | No | `3000` | Port for the Next.js server. |

---

## 2. Build and Compilation Pipeline

In your CI/CD runner (GitHub Actions, GitLab CI, etc.), execute the following steps to build the production assets:

```bash
# 1. Install all dependencies across the monorepo workspace
pnpm install --frozen-lockfile

# 2. Compile TypeScript workspace packages (shared types, auth logic, and DB client)
pnpm build

# 3. Compile Next.js production build
pnpm --filter @agentready/web build
```

---

## 3. Production Database Migrations & Seeding

Never run `prisma migrate dev` on production databases. Instead, execute the non-interactive `prisma migrate deploy` engine to apply migration files safely:

```bash
# 1. Deploy schema changes to production PostgreSQL
DATABASE_URL="your-production-db-url" pnpm --filter @agentready/db exec prisma migrate deploy --schema ../../prisma/schema.prisma

# 2. Seed core baseline entities (such as default organizations and roles)
DATABASE_URL="your-production-db-url" pnpm db:seed
```

---

## 4. Launching the Services

Once built and migrated, start the production Node processes.

### A. Run Backend API
```bash
NODE_ENV=production DATABASE_URL="..." AUTH_SESSION_SECRET="..." API_CORS_ORIGINS="..." node apps/api/dist/index.js
```
*(Alternatively, configure a process manager like PM2 or run via Docker using standard process lifecycle orchestrators).*

### B. Run Frontend Dashboard
```bash
NEXT_PUBLIC_AGENTREADY_API_URL="https://api.agentready.com" pnpm --filter @agentready/web start
```

---

## 5. Security & Verification Checklist

- [ ] **SSL/TLS (HTTPS)**: Ensure both the dashboard and API run under HTTPS to allow secure cookie exchange.
- [ ] **HTTP-only Cookies**: The backend issues session cookies with `SameSite=Lax` and `Secure=true` in production, which browsers will block if HTTPS is not configured.
- [ ] **Sentry Health Checks**: Trigger a test endpoint or inspect your Sentry dashboard to verify that errors are logged.
