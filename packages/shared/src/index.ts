import { z } from "zod";

export const agentExecutionStatusSchema = z.enum([
  "QUEUED",
  "RUNNING",
  "WAITING_FOR_APPROVAL",
  "SUCCEEDED",
  "FAILED",
  "CANCELLED"
]);

export const toolCallStatusSchema = z.enum(["PENDING", "RUNNING", "SUCCEEDED", "FAILED", "BLOCKED"]);

export const evalRunStatusSchema = z.enum(["QUEUED", "RUNNING", "PASSED", "FAILED", "ERRORED"]);

export const approvalGateModeSchema = z.enum(["AUTOMATIC", "REQUIRE_APPROVAL", "BLOCKED"]);

export const featureFlagStateSchema = z.enum(["ENABLED", "DISABLED"]);

export const mcpServerStatusSchema = z.enum(["PLANNED", "ACTIVE", "DISABLED"]);

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
  // Worker-readiness: callers may configure timeout and max retry attempts.
  // TODO(WORKER-READY): The execution runner reads these values when claiming work.
  timeoutMs: z.number().int().min(1000).optional(),       // e.g. 30_000 for 30 s
  maxAttempts: z.number().int().min(1).max(10).default(1), // default: one attempt only
  metadata: jsonRecordSchema.optional()
});

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

export const createEvalRunSchema = z.object({
  organizationId: z.string().min(1),
  projectId: z.string().min(1),
  name: z.string().min(1),
  executionId: z.string().min(1).optional(),
  contractId: z.string().min(1).optional(),
  agentId: z.string().min(1).optional(),
  status: evalRunStatusSchema.default("QUEUED"),
  score: z.number().min(0).max(1).optional(),
  threshold: z.number().min(0).max(1).default(1),
  checks: z.array(jsonRecordSchema).default([]),
  findings: z.array(z.string()).default([])
});

export const upsertApprovalGateSchema = z.object({
  organizationId: z.string().min(1),
  capability: z.string().min(1),
  mode: approvalGateModeSchema,
  reason: z.string().optional(),
  riskLevel: z.number().int().min(0).max(100).optional().default(0),
  enabled: z.boolean().optional().default(true)
});

export function matchPattern(pattern: string, action: string): boolean {
  const regexStr = "^" + pattern.split("*").map(s => s.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&")).join(".*") + "$";
  const regex = new RegExp(regexStr);
  return regex.test(action);
}

export const upsertAgentFeatureFlagSchema = z.object({
  organizationId: z.string().min(1),
  agentId: z.string().nullable().optional(),
  capability: z.string().min(1),
  state: featureFlagStateSchema,
  description: z.string().optional()
});

export type AgentExecutionStatus = z.infer<typeof agentExecutionStatusSchema>;
export type ToolCallStatus = z.infer<typeof toolCallStatusSchema>;
export type EvalRunStatus = z.infer<typeof evalRunStatusSchema>;
export type ApprovalGateMode = z.infer<typeof approvalGateModeSchema>;
export type FeatureFlagState = z.infer<typeof featureFlagStateSchema>;
export type McpServerStatus = z.infer<typeof mcpServerStatusSchema>;
export type CreateAgentExecutionInput = z.infer<typeof createAgentExecutionSchema>;
export type CreateToolCallTraceInput = z.infer<typeof createToolCallTraceSchema>;
export type CreateEvalRunInput = z.infer<typeof createEvalRunSchema>;

export const createEvalCaseSchema = z.object({
  organizationId: z.string().min(1),
  taskContractId: z.string().min(1),
  name: z.string().min(1),
  input: jsonRecordSchema.default({}),
  expectedStatus: z.string().optional(),
  expectedTools: z.array(z.string()).default([]),
  successCriteria: z.string().optional()
});

export type CreateEvalCaseInput = z.infer<typeof createEvalCaseSchema>;
