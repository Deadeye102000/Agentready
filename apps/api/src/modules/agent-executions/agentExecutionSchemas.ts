import {
  agentExecutionStatusSchema,
  createAgentExecutionSchema,
  createToolCallTraceSchema,
  toolCallStatusSchema
} from "@agentready/shared";
import { z } from "zod";

export const executionListQuerySchema = z.object({
  projectId: z.string().min(1).optional(),
  status: agentExecutionStatusSchema.optional()
});

export const executionParamsSchema = z.object({
  id: z.string().min(1)
});

export const updateExecutionBodySchema = z.object({
  status: agentExecutionStatusSchema,
  output: z.unknown().optional(),
  completedAt: z.coerce.date().optional()
});

export const updateToolCallTraceBodySchema = z.object({
  status: toolCallStatusSchema,
  output: z.unknown().optional(),
  error: z.string().optional(),
  latencyMs: z.number().int().min(0).optional()
});

export const createExecutionBodySchema = createAgentExecutionSchema.omit({ organizationId: true });
export const createToolCallTraceBodySchema = createToolCallTraceSchema.omit({ organizationId: true });

export const checkToolCallBodySchema = z.object({
  toolName: z.string().min(1).max(128),
  arguments: z.record(z.unknown()).default({}),
  idempotencyKey: z.string().optional()
});

export const reportToolCallResultBodySchema = z.object({
  status: z.enum(["SUCCEEDED", "FAILED"]),
  output: z.record(z.unknown()).optional(),
  error: z.string().optional(),
  latencyMs: z.number().int().min(0).optional(),
  isFinalAction: z.boolean().optional()
});

export const toolCallTraceParamsSchema = z.object({
  traceId: z.string().min(1)
});

export const toolCallTraceListQuerySchema = z.object({
  executionId: z.string().min(1).optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(50)
});
