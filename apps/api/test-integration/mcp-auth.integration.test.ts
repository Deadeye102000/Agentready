import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import type { FastifyInstance } from "fastify";
import { setupEphemeralPostgres, teardownEphemeralPostgres, type EphemeralPostgresContext } from "./setup/ephemeralPostgres.js";
import { buildServer } from "../src/server.js";
import { createMcpServer } from "../../mcp-server/src/index.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";

describe("Real PostgreSQL & Fastify: MCP Server Real Auth Flow End-to-End", () => {
  let ctx: EphemeralPostgresContext;
  let app: FastifyInstance;
  let apiUrl: string;

  before(async () => {
    ctx = await setupEphemeralPostgres();

    // Start Fastify server bound to real Testcontainers Postgres
    app = await buildServer({ prisma: ctx.prisma });
    await app.listen({ port: 0, host: "127.0.0.1" });

    const addr = app.server.address() as any;
    apiUrl = `http://127.0.0.1:${addr.port}`;
  });

  after(async () => {
    if (app) {
      await app.close().catch(() => {});
    }
    await teardownEphemeralPostgres();
  });

  it("authenticates MCP client via real PostgreSQL API key hash and returns tenant task contracts", async () => {
    // 1. Seed tenant organization and agent
    const org = await ctx.prisma.organization.create({
      data: { name: "MCP Real Org", slug: `org-mcp-${Date.now()}` },
    });

    const foreignOrg = await ctx.prisma.organization.create({
      data: { name: "Foreign MCP Org", slug: `org-foreign-mcp-${Date.now()}` },
    });

    const agent = await ctx.prisma.agentIdentity.create({
      data: { organizationId: org.id, name: "MCP Agent Runner" },
    });

    // 2. Create a plaintext API key and insert SHA-256 hash into real PostgreSQL
    const plaintextKey = `ar_live_real_${crypto.randomBytes(16).toString("hex")}`;
    const keyHash = crypto.createHash("sha256").update(plaintextKey).digest("hex");

    const apiKeyRecord = await ctx.prisma.apiKey.create({
      data: {
        organizationId: org.id,
        agentId: agent.id,
        name: "MCP Automated Key",
        keyPrefix: plaintextKey.slice(0, 8),
        keyHash,
        scopes: ["*"],
      },
    });

    const project = await ctx.prisma.project.create({
      data: { organizationId: org.id, name: "Tenant MCP Project" },
    });

    const foreignProject = await ctx.prisma.project.create({
      data: { organizationId: foreignOrg.id, name: "Foreign MCP Project" },
    });

    // 3. Seed TaskContracts: one in tenant org, one in foreign org
    await ctx.prisma.taskContract.create({
      data: {
        organizationId: org.id,
        projectId: project.id,
        name: "Tenant Governance Contract",
        version: 1,
        allowedTools: ["tenant_query_db", "tenant_read_docs"],
        objective: "Contract belonging to the authenticated tenant",
      },
    });

    await ctx.prisma.taskContract.create({
      data: {
        organizationId: foreignOrg.id,
        projectId: foreignProject.id,
        name: "Foreign Secret Contract",
        version: 1,
        allowedTools: ["secret_tool"],
        objective: "Contract belonging to a completely different tenant",
      },
    });

    // 4. Initialize real MCP server pointed at real Fastify API
    const mcpServer = createMcpServer({
      apiUrl,
      apiKey: plaintextKey,
    });

    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await mcpServer.connect(serverTransport);

    const client = new Client(
      { name: "mcp-e2e-client", version: "1.0.0" },
      { capabilities: {} }
    );
    await client.connect(clientTransport);

    // 5. Invoke list_task_contracts tool
    const result = await client.callTool({
      name: "list_task_contracts",
      arguments: {},
    });

    assert.equal(result.isError, undefined);
    assert.ok(Array.isArray(result.content));
    const contentList = result.content as Array<{ type: string; text: string }>;
    assert.equal(contentList[0].type, "text");

    const contracts = JSON.parse(contentList[0].text);
    assert.ok(Array.isArray(contracts));
    assert.equal(contracts.length, 1);
    assert.equal(contracts[0].name, "Tenant Governance Contract");
    // Ensure foreign contract is never leaked across tenants
    assert.ok(!contentList[0].text.includes("Foreign Secret Contract"));

    // 6. Verify real PostgreSQL side effect: lastUsedAt timestamp was updated asynchronously
    // Wait briefly for background update to complete in Postgres
    await new Promise((resolve) => setTimeout(resolve, 100));
    const refreshedKey = await ctx.prisma.apiKey.findUnique({
      where: { id: apiKeyRecord.id },
    });
    assert.ok(refreshedKey?.lastUsedAt !== null, "apiKey.lastUsedAt must be updated in real PostgreSQL");

    await client.close();
  });

  it("aggregates tools across task contracts, feature flags, and approval gates from real PostgreSQL", async () => {
    const org = await ctx.prisma.organization.create({
      data: { name: "MCP Capabilities Org", slug: `org-mcp-cap-${Date.now()}` },
    });

    const agent = await ctx.prisma.agentIdentity.create({
      data: { organizationId: org.id, name: "MCP Cap Agent" },
    });

    const plaintextKey = `ar_live_cap_${crypto.randomBytes(16).toString("hex")}`;
    const keyHash = crypto.createHash("sha256").update(plaintextKey).digest("hex");

    await ctx.prisma.apiKey.create({
      data: {
        organizationId: org.id,
        agentId: agent.id,
        name: "Cap Key",
        keyPrefix: plaintextKey.slice(0, 8),
        keyHash,
        scopes: ["*"],
      },
    });

    const capProject = await ctx.prisma.project.create({
      data: { organizationId: org.id, name: "Cap Project" },
    });

    // Seed task contract, feature flag, and approval gate in real Postgres
    await ctx.prisma.taskContract.create({
      data: {
        organizationId: org.id,
        projectId: capProject.id,
        name: "Dev Contract",
        version: 1,
        objective: "Dev contract objective",
        allowedTools: ["code_editor"],
      },
    });

    await ctx.prisma.agentFeatureFlag.create({
      data: {
        organizationId: org.id,
        capability: "ai_inference_v2",
        state: "ENABLED",
      },
    });

    await ctx.prisma.approvalGate.create({
      data: {
        organizationId: org.id,
        capability: "production_deploy",
        mode: "REQUIRE_APPROVAL",
      },
    });

    const mcpServer = createMcpServer({
      apiUrl,
      apiKey: plaintextKey,
    });

    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await mcpServer.connect(serverTransport);

    const client = new Client(
      { name: "mcp-tools-client", version: "1.0.0" },
      { capabilities: {} }
    );
    await client.connect(clientTransport);

    const result = await client.callTool({
      name: "list_available_tools",
      arguments: {},
    });

    assert.equal(result.isError, undefined);
    assert.ok(Array.isArray(result.content));
    const content = result.content as Array<{ type: string; text: string }>;
    const parsed = JSON.parse(content[0].text);
    assert.ok(parsed.availableTools.includes("code_editor"));
    assert.ok(parsed.availableTools.includes("ai_inference_v2"));
    assert.ok(parsed.availableTools.includes("production_deploy"));

    await client.close();
  });

  it("rejects MCP client when API key does not exist in real PostgreSQL (401 Unauthorized)", async () => {
    const unregisteredKey = `ar_live_nonexistent_${crypto.randomBytes(16).toString("hex")}`;

    const mcpServer = createMcpServer({
      apiUrl,
      apiKey: unregisteredKey,
    });

    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await mcpServer.connect(serverTransport);

    const client = new Client(
      { name: "mcp-unauth-client", version: "1.0.0" },
      { capabilities: {} }
    );
    await client.connect(clientTransport);

    const result = await client.callTool({
      name: "list_task_contracts",
      arguments: {},
    });

    assert.equal(result.isError, true);
    assert.ok(Array.isArray(result.content));
    const content = result.content as Array<{ type: string; text: string }>;
    assert.ok(content[0].text.includes("401"), "Expected 401 error in MCP response");

    await client.close();
  });

  it("rejects MCP client when API key is marked revoked in real PostgreSQL", async () => {
    const org = await ctx.prisma.organization.create({
      data: { name: "Revoked Org", slug: `org-revoked-${Date.now()}` },
    });

    const agent = await ctx.prisma.agentIdentity.create({
      data: { organizationId: org.id, name: "Revoked Agent" },
    });

    const plaintextKey = `ar_live_revoked_${crypto.randomBytes(16).toString("hex")}`;
    const keyHash = crypto.createHash("sha256").update(plaintextKey).digest("hex");

    await ctx.prisma.apiKey.create({
      data: {
        organizationId: org.id,
        agentId: agent.id,
        name: "Revoked Key",
        keyPrefix: plaintextKey.slice(0, 8),
        keyHash,
        scopes: ["*"],
        revokedAt: new Date(), // Already revoked in real Postgres
      },
    });

    const mcpServer = createMcpServer({
      apiUrl,
      apiKey: plaintextKey,
    });

    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await mcpServer.connect(serverTransport);

    const client = new Client(
      { name: "mcp-revoked-client", version: "1.0.0" },
      { capabilities: {} }
    );
    await client.connect(clientTransport);

    const result = await client.callTool({
      name: "list_task_contracts",
      arguments: {},
    });

    assert.equal(result.isError, true);
    assert.ok(Array.isArray(result.content));
    const content = result.content as Array<{ type: string; text: string }>;
    assert.ok(content[0].text.includes("401"), "Revoked key must receive 401 Unauthorized");

    await client.close();
  });

  it("rejects MCP client when API key is expired in real PostgreSQL", async () => {
    const org = await ctx.prisma.organization.create({
      data: { name: "Expired Org", slug: `org-expired-${Date.now()}` },
    });

    const agent = await ctx.prisma.agentIdentity.create({
      data: { organizationId: org.id, name: "Expired Agent" },
    });

    const plaintextKey = `ar_live_expired_${crypto.randomBytes(16).toString("hex")}`;
    const keyHash = crypto.createHash("sha256").update(plaintextKey).digest("hex");

    await ctx.prisma.apiKey.create({
      data: {
        organizationId: org.id,
        agentId: agent.id,
        name: "Expired Key",
        keyPrefix: plaintextKey.slice(0, 8),
        keyHash,
        scopes: ["*"],
        expiresAt: new Date(Date.now() - 3600 * 1000), // Expired 1 hour ago
      },
    });

    const mcpServer = createMcpServer({
      apiUrl,
      apiKey: plaintextKey,
    });

    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await mcpServer.connect(serverTransport);

    const client = new Client(
      { name: "mcp-expired-client", version: "1.0.0" },
      { capabilities: {} }
    );
    await client.connect(clientTransport);

    const result = await client.callTool({
      name: "list_task_contracts",
      arguments: {},
    });

    assert.equal(result.isError, true);
    assert.ok(Array.isArray(result.content));
    const content = result.content as Array<{ type: string; text: string }>;
    assert.ok(content[0].text.includes("401"), "Expired key must receive 401 Unauthorized");

    await client.close();
  });
});
