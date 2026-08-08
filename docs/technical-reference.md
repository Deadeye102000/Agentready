# AgentReady Technical Reference Document

This document provides a low-level technical reference of AgentReady's database schema models, authentication hooks, executions and tool call routing endpoints, and policy evaluation rules.

---

## 1. Prisma Schema Definition

Verbatim definitions from the database configuration schema ([schema.prisma](../prisma/schema.prisma)):

```prisma
model AgentIdentity {
  id             String             @id @default(cuid())
  organizationId String
  name           String
  description    String?
  disabledAt     DateTime?
  createdAt      DateTime           @default(now())
  updatedAt      DateTime           @updatedAt
  organization   Organization       @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  executions     AgentExecution[]
  toolTraces     ToolCallTrace[]
  featureFlags   AgentFeatureFlag[]
  evalCases      EvalCase[]
  evalRuns       EvalRun[]
  apiKeys        ApiKey[]

  @@index([organizationId])
}

model Project {
  id             String           @id @default(cuid())
  organizationId String
  name           String
  description    String?
  createdAt      DateTime         @default(now())
  updatedAt      DateTime         @updatedAt
  organization   Organization     @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  tasks          Task[]
  executions     AgentExecution[]
  evalRuns       EvalRun[]

  @@index([organizationId])
}

model Task {
  id             String           @id @default(cuid())
  organizationId String
  projectId      String
  title          String
  description    String?
  status         String           @default("OPEN")
  createdAt      DateTime         @default(now())
  updatedAt      DateTime         @updatedAt
  organization   Organization     @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  project        Project          @relation(fields: [projectId], references: [id], onDelete: Cascade)
  executions     AgentExecution[]

  @@index([organizationId])
  @@index([projectId])
}

model TaskContract {
  id               String           @id @default(cuid())
  organizationId   String
  projectId        String
  taskId           String?
  agentId          String?
  name             String
  version          Int              @default(1)
  objective        String
  inputs           Json             @default("{}")
  successCriteria  Json             @default("[]")
  allowedTools     Json             @default("[]")
  requiredApprovals Json            @default("[]")
  evalSpec         Json             @default("{}")
  createdAt        DateTime         @default(now())
  updatedAt        DateTime         @updatedAt
  organization     Organization     @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  executions       AgentExecution[]
  evalCases        EvalCase[]
  evalRuns         EvalRun[]

  @@index([organizationId])
  @@index([projectId])
}

model AgentExecution {
  id                  String            @id @default(cuid())
  organizationId      String
  projectId           String
  agentId             String
  taskId              String?
  contractId          String?
  status              String            @default("QUEUED")
  objective           String
  input               Json              @default("{}")
  output              Json?
  error               String?
  riskScore           Int               @default(0)
  startedAt           DateTime?
  finishedAt          DateTime?
  timeoutMs           Int?
  maxAttempts         Int               @default(1)
  attemptCount        Int               @default(0)
  metadata            Json?
  createdAt           DateTime          @default(now())
  updatedAt           DateTime          @updatedAt
  organization        Organization      @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  project             Project           @relation(fields: [projectId], references: [id], onDelete: Cascade)
  agent               AgentIdentity     @relation(fields: [agentId], references: [id], onDelete: Cascade)
  task                Task?             @relation(fields: [taskId], references: [id], onDelete: SetNull)
  contract            TaskContract?     @relation(fields: [contractId], references: [id], onDelete: SetNull)
  toolCallTraces      ToolCallTrace[]
  approvalRequests    ApprovalRequest[]
  evalRuns            EvalRun[]

  @@index([organizationId])
  @@index([projectId])
  @@index([agentId])
  @@index([status])
}

model ToolCallTrace {
  id                String            @id @default(cuid())
  organizationId    String
  executionId       String
  agentId           String
  toolName          String
  status            String            @default("PENDING")
  input             Json              @default("{}")
  output            Json?
  error             String?
  latencyMs         Int?
  approvalRequestId String?
  createdAt         DateTime          @default(now())
  organization      Organization      @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  execution         AgentExecution    @relation(fields: [executionId], references: [id], onDelete: Cascade)
  agent             AgentIdentity     @relation(fields: [agentId], references: [id], onDelete: Cascade)
  approvalRequest   ApprovalRequest?  @relation(fields: [approvalRequestId], references: [id], onDelete: SetNull)

  @@index([organizationId])
  @@index([executionId])
  @@index([agentId])
  @@index([status])
}

model ApprovalRequest {
  id               String            @id @default(cuid())
  organizationId   String
  executionId      String
  action           String
  payload          Json              @default("{}")
  status           String            @default("PENDING")
  reviewedByUserId String?
  reviewNote       String?
  reviewedAt       DateTime?
  createdAt        DateTime          @default(now())
  updatedAt        DateTime          @updatedAt
  organization     Organization      @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  execution        AgentExecution    @relation(fields: [executionId], references: [id], onDelete: Cascade)
  reviewedByUser   User?             @relation(fields: [reviewedByUserId], references: [id], onDelete: SetNull)
  toolCallTraces   ToolCallTrace[]

  @@index([organizationId])
  @@index([executionId])
  @@index([status])
  @@index([reviewedByUserId])
}
```

---

## 2. Machine Authorization Middleware (`requireMachineAuth`)

Verbatim implementation of the preHandler hook in [machineAuthPlugin.ts](../apps/api/src/modules/auth/machineAuthPlugin.ts):

```typescript
import type { FastifyReply, FastifyRequest } from "fastify";
import crypto from "crypto";
import { HttpError } from "../../lib/httpError.js";

export const requireMachineAuth = async (request: FastifyRequest, reply: FastifyReply) => {
  const authHeader = request.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    throw new HttpError({
      code: "UNAUTHORIZED",
      message: "Missing or invalid Bearer authorization header",
      statusCode: 401
    });
  }

  const token = authHeader.slice(7).trim();
  const keyHash = crypto.createHash("sha256").update(token).digest("hex");

  const apiKey = await request.server.prisma.apiKey.findUnique({
    where: { keyHash },
    include: { organization: true }
  });

  if (!apiKey || apiKey.revokedAt) {
    throw new HttpError({
      code: "UNAUTHORIZED",
      message: "Invalid or revoked API key",
      statusCode: 401
    });
  }

  if (apiKey.expiresAt && apiKey.expiresAt < new Date()) {
    throw new HttpError({
      code: "UNAUTHORIZED",
      message: "API key has expired",
      statusCode: 401
    });
  }

  // Update lastUsedAt asynchronously
  request.server.prisma.apiKey.update({
    where: { id: apiKey.id },
    data: { lastUsedAt: new Date() }
  }).catch(() => {});

  // Populate authContext
  request.authContext = {
    userId: `machine:${apiKey.id}`,
    organizationId: apiKey.organizationId,
    role: "AGENT",
    sessionId: `apikey:${apiKey.id}`
  };
};
```

---

## 3. Routes, Request Validation Schemas, & Service Implementations

### A. Executions Route Handler (`POST /api/v1/executions`)

Route handler in [agentExecutionRoutes.ts](../apps/api/src/modules/agent-executions/agentExecutionRoutes.ts):
```typescript
  app.post("/executions", async (request, reply) => {
    const context = requireOrgContext(request);
    const body = validateBody(createExecutionBodySchema, request.body);

    // Step 1: Accept — create the QUEUED record with full governance checks.
    const execution = await service.create({ ...body, organizationId: context.organizationId });

    // Step 2: Enqueue — hand the work off to the ExecutionRunner boundary.
    await runner.enqueue({
      id: execution.id,
      organizationId: execution.organizationId,
      agentId: execution.agentId,
      timeoutMs: execution.timeoutMs ?? undefined,
      maxAttempts: execution.maxAttempts ?? 1,
      attemptCount: execution.attemptCount ?? 0
    });

    // Step 3: Reply — always 201 with the QUEUED record.
    return reply.code(201).send(execution);
  });
```

Zod Request Validation Schema (resolved from `@agentready/shared` schema definition in [index.ts](../packages/shared/src/index.ts)):
```typescript
export const jsonRecordSchema = z.record(z.unknown());

export const createAgentExecutionSchema = z.object({
  organizationId: z.string().min(1),
  projectId: z.string().min(1),
  agentId: z.string().min(1),
  taskId: z.string().min(1).optional(),
  contractId: z.string().min(1).optional(),
  objective: z.string().min(1),
  input: jsonRecordSchema.default({}),
  riskScore: z.number().int().min(0).max(100).default(0),
  timeoutMs: z.number().int().min(1000).optional(),
  maxAttempts: z.number().int().min(1).max(10).default(1),
  metadata: jsonRecordSchema.optional()
});

// Omits organizationId (as it is server-derived from authContext)
export const createExecutionBodySchema = createAgentExecutionSchema.omit({ organizationId: true });
```

Service Creation implementation (`service.create`) and Side Effects in [agentExecutionService.ts](../apps/api/src/modules/agent-executions/agentExecutionService.ts):
```typescript
  async create(input: CreateAgentExecutionInput) {
    await this.tenancy.requireProject({
      organizationId: input.organizationId,
      projectId: input.projectId
    });
    await this.tenancy.requireTask({
      organizationId: input.organizationId,
      taskId: input.taskId
    });
    await this.tenancy.requireContract({
      organizationId: input.organizationId,
      contractId: input.contractId
    });
    const isExecutionEnabled = await this.governance.findFeatureFlag({
      organizationId: input.organizationId,
      agentId: input.agentId,
      capability: "agent_execution"
    });
    if (isExecutionEnabled && isExecutionEnabled.state === "DISABLED") {
      throw new HttpError({
        code: "FORBIDDEN",
        message: "Agent execution is disabled by feature flag",
        statusCode: 403
      });
    }

    await this.tenancy.requireAgent({
      organizationId: input.organizationId,
      agentId: input.agentId
    });

    let initialStatus: AgentExecutionStatus = "QUEUED";
    let requiresApproval = false;
    let matchingGateReason = "";
    let matchingGateTool = "";

    if (input.contractId) {
      const contract = await this.executions.findContractById(input.contractId);
      if (contract && Array.isArray(contract.allowedTools)) {
        const gates = await this.governance.listApprovalGates({
          organizationId: input.organizationId
        });

        // Determine if auto-approval feature flag is disabled
        const autoApprovalFlag = await this.governance.findFeatureFlag({
          organizationId: input.organizationId,
          agentId: input.agentId,
          capability: "auto_approval"
        });
        const isAutoApprovalDisabled = autoApprovalFlag && autoApprovalFlag.state === "DISABLED";

        for (const toolName of contract.allowedTools as string[]) {
          const matchingGates = gates.filter(
            (g) => g.enabled && matchPattern(g.capability, toolName)
          );
          matchingGates.sort((a, b) => b.capability.length - a.capability.length);
          const gate = matchingGates[0];

          if (gate && input.riskScore >= gate.riskLevel) {
            let effectiveMode = gate.mode;
            if (effectiveMode === "AUTOMATIC" && isAutoApprovalDisabled) {
              effectiveMode = "REQUIRE_APPROVAL";
            }

            if (effectiveMode === "BLOCKED") {
              throw new HttpError({
                code: "FORBIDDEN",
                message: `Execution start blocked by policy: tool '${toolName}' is BLOCKED`,
                statusCode: 403
              });
            } else if (effectiveMode === "REQUIRE_APPROVAL") {
              requiresApproval = true;
              matchingGateTool = toolName;
              matchingGateReason = gate.reason || `Tool '${toolName}' requires human approval.`;
            }
          }
        }
      }
    }

    if (requiresApproval) {
      initialStatus = "WAITING_FOR_APPROVAL";
    }

    const execution = await this.executions.create({
      organizationId: input.organizationId,
      projectId: input.projectId,
      taskId: input.taskId,
      contractId: input.contractId,
      agentId: input.agentId,
      status: initialStatus,
      objective: input.objective,
      input: toInputJson(input.input),
      riskScore: input.riskScore,
      timeoutMs: input.timeoutMs,
      maxAttempts: input.maxAttempts ?? 1,
      attemptCount: 0
    });

    if (requiresApproval) {
      await this.governance.createApprovalRequest({
        organizationId: input.organizationId,
        agentId: input.agentId,
        requestedAction: `execution.start:${matchingGateTool}`,
        reason: `Risky execution start: ${matchingGateReason}`,
        payload: {
          executionId: execution.id,
          projectId: input.projectId,
          contractId: input.contractId,
          agentId: input.agentId,
          riskScore: input.riskScore
        },
        status: "PENDING"
      });
    }

    await this.audit.record({
      organizationId: input.organizationId,
      source: "AGENT",
      actorAgentId: input.agentId,
      action: "agent_execution.created",
      resourceType: "AgentExecution",
      resourceId: execution.id,
      after: {
        status: execution.status,
        objective: execution.objective,
        riskScore: execution.riskScore,
        projectId: execution.projectId,
        contractId: input.contractId,
        taskId: input.taskId,
        maxAttempts: input.maxAttempts ?? 1,
        timeoutMs: input.timeoutMs ?? null
      },
      metadata: {
        workerReady: true,
        ...(input.metadata ?? {})
      }
    });

    return execution;
  }
```

---

### B. Tool Call Trace Route Handler (`POST /api/v1/tool-call-traces`)

Route handler in [agentExecutionRoutes.ts](../apps/api/src/modules/agent-executions/agentExecutionRoutes.ts):
```typescript
  app.post("/tool-call-traces", async (request, reply) => {
    const context = requireOrgContext(request);
    const body = validateBody(createToolCallTraceBodySchema, request.body);
    const trace = await service.recordToolCall({ ...body, organizationId: context.organizationId });
    return reply.code(201).send(trace);
  });
```

Zod Request Validation Schema (resolved from `@agentready/shared` schema definition in [index.ts](../packages/shared/src/index.ts)):
```typescript
export const toolCallStatusSchema = z.enum(["PENDING", "RUNNING", "SUCCEEDED", "FAILED", "BLOCKED"]);

export const createToolCallTraceSchema = z.object({
  organizationId: z.string().min(1),
  executionId: z.string().min(1),
  agentId: z.string().min(1),
  toolName: z.string().min(1),
  status: toolCallStatusSchema.default("PENDING"),
  input: jsonRecordSchema.default({}),
  output: z.unknown().optional(),
  error: z.string().optional(),
  latencyMs: z.number().int().min(0).optional(),
  approvalRequestId: z.string().min(1).optional()
});

// Omits organizationId (as it is server-derived from authContext)
export const createToolCallTraceBodySchema = createToolCallTraceSchema.omit({ organizationId: true });
```

Service Trace recording implementation (`service.recordToolCall`) and Side Effects in [agentExecutionService.ts](../apps/api/src/modules/agent-executions/agentExecutionService.ts):
```typescript
  async recordToolCall(input: CreateToolCallTraceInput) {
    await this.tenancy.requireAgent({
      organizationId: input.organizationId,
      agentId: input.agentId
    });

    const execution = await this.executions.findById({
      organizationId: input.organizationId,
      id: input.executionId
    });
    if (!execution) {
      throw new HttpError({
        code: "NOT_FOUND",
        message: "Agent execution was not found for this organization",
        statusCode: 404
      });
    }

    const featureFlag = await this.governance.findFeatureFlag({
      organizationId: input.organizationId,
      agentId: input.agentId,
      capability: input.toolName
    });
    const globalToolFlag = await this.governance.findFeatureFlag({
      organizationId: input.organizationId,
      agentId: input.agentId,
      capability: "tool_execution"
    });
    const autoApprovalFlag = await this.governance.findFeatureFlag({
      organizationId: input.organizationId,
      agentId: input.agentId,
      capability: "auto_approval"
    });

    const isToolDisabled = (featureFlag && featureFlag.state === "DISABLED") || (globalToolFlag && globalToolFlag.state === "DISABLED");
    const isAutoApprovalDisabled = autoApprovalFlag && autoApprovalFlag.state === "DISABLED";

    const gates = await this.governance.listApprovalGates({
      organizationId: input.organizationId
    });

    const matchingGates = gates.filter(
      (g) => g.enabled && matchPattern(g.capability, input.toolName)
    );
    matchingGates.sort((a, b) => b.capability.length - a.capability.length);
    const gate = matchingGates[0];

    let status: ToolCallStatus = input.status;
    let error = input.error;
    let approvalRequestId = input.approvalRequestId;

    const gateTriggers = gate && execution.riskScore >= gate.riskLevel;

    let effectiveMode = gate?.mode;
    if (effectiveMode === "AUTOMATIC" && isAutoApprovalDisabled) {
      effectiveMode = "REQUIRE_APPROVAL";
    }

    if (isToolDisabled) {
      status = "BLOCKED";
      error = `Capability ${input.toolName} is disabled for this agent by feature flag.`;

      if (execution.status === "RUNNING") {
        await this.transition({
          organizationId: input.organizationId,
          id: execution.id,
          status: "FAILED",
          output: { error: `Execution blocked: Capability ${input.toolName} is disabled by feature flag.` }
        });
      }
    } else if (gateTriggers && effectiveMode === "BLOCKED") {
      status = "BLOCKED";
      error = gate.reason ?? `Capability ${input.toolName} is blocked by policy.`;
    } else if (gateTriggers && effectiveMode === "REQUIRE_APPROVAL" && status !== "BLOCKED") {
      const approval = await this.governance.createApprovalRequest({
        organizationId: input.organizationId,
        agentId: input.agentId,
        requestedAction: input.toolName,
        reason: gate.reason ?? `Capability ${input.toolName} requires approval.`,
        payload: toInputJson({
          executionId: input.executionId,
          toolName: input.toolName,
          input: input.input
        }),
        status: "PENDING"
      });

      approvalRequestId = approval.id;
      status = "BLOCKED";
      error = "approval_requested";

      if (execution.status === "RUNNING") {
        await this.transition({
          organizationId: input.organizationId,
          id: execution.id,
          status: "WAITING_FOR_APPROVAL"
        });
      }
    }

    const completed = ["SUCCEEDED", "FAILED", "BLOCKED"].includes(status);
    const trace = await this.executions.createTrace({
      organizationId: input.organizationId,
      executionId: input.executionId,
      agentId: input.agentId,
      toolName: input.toolName,
      status,
      input: toInputJson(input.input),
      output: input.output === undefined ? undefined : toInputJson(input.output),
      error,
      latencyMs: input.latencyMs,
      approvalRequestId,
      completedAt: completed ? new Date() : undefined
    });

    await this.audit.record({
      organizationId: input.organizationId,
      source: "AGENT",
      actorAgentId: input.agentId,
      action: "tool_call_trace.recorded",
      resourceType: "ToolCallTrace",
      resourceId: trace.id,
      after: {
        status: trace.status,
        toolName: trace.toolName,
        latencyMs: trace.latencyMs,
        approvalRequestId: trace.approvalRequestId,
        error: trace.error
      },
      metadata: {
        executionId: input.executionId,
        toolName: input.toolName
      }
    });

    return trace;
  }
```

---

## 4. Approval Gate Policy Gating Logic

The evaluation logic deciding whether a capability execution or tool call behaves as `AUTOMATIC` (allow immediately), `REQUIRE_APPROVAL` (suspend execution and prompt human), or `BLOCKED` (immediate rejection) is located across the following files and functions:

### A. Pattern Matching Function
- **File**: [index.ts](../packages/shared/src/index.ts)
- **Function**: `matchPattern`
- **Code**:
```typescript
export function matchPattern(pattern: string, action: string): boolean {
  const regexStr = "^" + pattern.split("*").map(s => s.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&")).join(".*") + "$";
  const regex = new RegExp(regexStr);
  return regex.test(action);
}
```

### B. Execution-Start Gating Logic
- **File**: [agentExecutionService.ts](../apps/api/src/modules/agent-executions/agentExecutionService.ts)
- **Function**: `create`
- **Logic**: Evaluates contract allowedTools against active gates. Overrides `AUTOMATIC` gates to `REQUIRE_APPROVAL` if the `auto_approval` feature flag is `DISABLED`. Rejects with a 403 forbidden error if `BLOCKED`.
- **Code Segment**:
```typescript
        // Determine if auto-approval feature flag is disabled
        const autoApprovalFlag = await this.governance.findFeatureFlag({
          organizationId: input.organizationId,
          agentId: input.agentId,
          capability: "auto_approval"
        });
        const isAutoApprovalDisabled = autoApprovalFlag && autoApprovalFlag.state === "DISABLED";

        for (const toolName of contract.allowedTools as string[]) {
          const matchingGates = gates.filter(
            (g) => g.enabled && matchPattern(g.capability, toolName)
          );
          matchingGates.sort((a, b) => b.capability.length - a.capability.length);
          const gate = matchingGates[0];

          if (gate && input.riskScore >= gate.riskLevel) {
            let effectiveMode = gate.mode;
            if (effectiveMode === "AUTOMATIC" && isAutoApprovalDisabled) {
              effectiveMode = "REQUIRE_APPROVAL";
            }

            if (effectiveMode === "BLOCKED") {
              throw new HttpError({
                code: "FORBIDDEN",
                message: `Execution start blocked by policy: tool '${toolName}' is BLOCKED`,
                statusCode: 403
              });
            } else if (effectiveMode === "REQUIRE_APPROVAL") {
              requiresApproval = true;
              matchingGateTool = toolName;
              matchingGateReason = gate.reason || `Tool '${toolName}' requires human approval.`;
            }
          }
        }
```

### C. Live Tool Execution Gating Logic
- **File**: [agentExecutionService.ts](../apps/api/src/modules/agent-executions/agentExecutionService.ts)
- **Function**: `recordToolCall`
- **Logic**: Resolves tool flags and matching gates. Overrides modes according to feature toggles, blocks capabilities when feature flags are `DISABLED` or gate evaluates to `BLOCKED`. Creates an `ApprovalRequest` and suspends the execution to `WAITING_FOR_APPROVAL` if `REQUIRE_APPROVAL` triggers.
- **Code Segment**:
```typescript
    const isToolDisabled = (featureFlag && featureFlag.state === "DISABLED") || (globalToolFlag && globalToolFlag.state === "DISABLED");
    const isAutoApprovalDisabled = autoApprovalFlag && autoApprovalFlag.state === "DISABLED";

    const gates = await this.governance.listApprovalGates({
      organizationId: input.organizationId
    });

    const matchingGates = gates.filter(
      (g) => g.enabled && matchPattern(g.capability, input.toolName)
    );
    matchingGates.sort((a, b) => b.capability.length - a.capability.length);
    const gate = matchingGates[0];

    let status: ToolCallStatus = input.status;
    let error = input.error;
    let approvalRequestId = input.approvalRequestId;

    const gateTriggers = gate && execution.riskScore >= gate.riskLevel;

    let effectiveMode = gate?.mode;
    if (effectiveMode === "AUTOMATIC" && isAutoApprovalDisabled) {
      effectiveMode = "REQUIRE_APPROVAL";
    }

    if (isToolDisabled) {
      status = "BLOCKED";
      error = `Capability ${input.toolName} is disabled for this agent by feature flag.`;

      if (execution.status === "RUNNING") {
        await this.transition({
          organizationId: input.organizationId,
          id: execution.id,
          status: "FAILED",
          output: { error: `Execution blocked: Capability ${input.toolName} is disabled by feature flag.` }
        });
      }
    } else if (gateTriggers && effectiveMode === "BLOCKED") {
      status = "BLOCKED";
      error = gate.reason ?? `Capability ${input.toolName} is blocked by policy.`;
    } else if (gateTriggers && effectiveMode === "REQUIRE_APPROVAL" && status !== "BLOCKED") {
      const approval = await this.governance.createApprovalRequest({
        organizationId: input.organizationId,
        agentId: input.agentId,
        requestedAction: input.toolName,
        reason: gate.reason ?? `Capability ${input.toolName} requires approval.`,
        payload: toInputJson({
          executionId: input.executionId,
          toolName: input.toolName,
          input: input.input
        }),
        status: "PENDING"
      });

      approvalRequestId = approval.id;
      status = "BLOCKED";
      error = "approval_requested";

      if (execution.status === "RUNNING") {
        await this.transition({
          organizationId: input.organizationId,
          id: execution.id,
          status: "WAITING_FOR_APPROVAL"
        });
      }
    }
```

---

## 5. MCP Financial Research Agent Project Context

A full case-insensitive code search for the phrase "Financial Research" was conducted across the `Agentready` repository. 

No matching files, configurations, prompts, or directories containing "Financial Research" or "Financial Research Agent" were found within this codebase scope.
