# syntax=docker/dockerfile:1
FROM node:22-alpine AS base
WORKDIR /app
RUN npm install -g pnpm@9.15.0

# Install dependencies
FROM base AS dependencies
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json ./apps/api/
COPY apps/web/package.json ./apps/web/
COPY apps/mcp-server/package.json ./apps/mcp-server/
COPY packages/db/package.json ./packages/db/
COPY packages/shared/package.json ./packages/shared/
COPY packages/auth/package.json ./packages/auth/
COPY packages/agent-contracts/package.json ./packages/agent-contracts/
COPY prisma/schema.prisma ./prisma/
RUN pnpm install --frozen-lockfile

# Build source code
FROM dependencies AS build
COPY . .
RUN pnpm build

# Production runner
FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production

COPY --from=build /app/package.json /app/pnpm-lock.yaml /app/pnpm-workspace.yaml ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/packages ./packages
COPY --from=build /app/apps/api ./apps/api

WORKDIR /app/apps/api
EXPOSE 3001

# Automatically deploy migrations prior to starting the Fastify server
CMD ["node", "scripts/start-production.mjs"]
