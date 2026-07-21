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
