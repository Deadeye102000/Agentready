import { z } from "zod";

export const agentExecutionStatusSchema = z.enum([
  "QUEUED",
  "RUNNING",
  "WAITING_FOR_APPROVAL",
  "SUCCEEDED",
  "FAILED",
  "CANCELLED"
]);

export const toolCallStatusSchema = z.enum(["PENDING", "RUNNING", "SUCCEEDED", "FAILED", "BLOCKED", "AWAITING_APPROVAL"]);

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

// Cache compiled regexes for complex wildcard patterns to avoid recompilation overhead
const matchPatternRegexCache = new Map<string, RegExp>();

export function matchPattern(pattern: string, action: string): boolean {
  // Fast path: exact match or match all
  if (pattern === '*') return true;

  const starIndex1 = pattern.indexOf('*');
  if (starIndex1 === -1) return pattern === action;

  // Fast path: single wildcard
  const starIndex2 = pattern.indexOf('*', starIndex1 + 1);
  if (starIndex2 === -1) {
    if (starIndex1 === 0) return action.endsWith(pattern.slice(1));
    if (starIndex1 === pattern.length - 1) return action.startsWith(pattern.slice(0, -1));

    const prefix = pattern.slice(0, starIndex1);
    const suffix = pattern.slice(starIndex1 + 1);
    return action.startsWith(prefix) && action.endsWith(suffix) && action.length >= pattern.length - 1;
  }

  // Fast path: double wildcard at boundaries (e.g. *substring*)
  if (starIndex1 === 0 && starIndex2 === pattern.length - 1 && pattern.indexOf('*', starIndex2 + 1) === -1) {
    return action.includes(pattern.slice(1, -1));
  }

  // Fallback to regex for complex patterns
  let regex = matchPatternRegexCache.get(pattern);
  if (!regex) {
    // Prevent unbounded memory growth if patterns are dynamically generated
    if (matchPatternRegexCache.size > 1000) matchPatternRegexCache.clear();

    const regexStr = "^" + pattern.split("*").map(s => s.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&")).join(".*") + "$";
    regex = new RegExp(regexStr);
    matchPatternRegexCache.set(pattern, regex);
  }
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
