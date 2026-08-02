import { createEvalRunSchema, createEvalCaseSchema } from "@agentready/shared";
import { z } from "zod";

export const evalRunListQuerySchema = z.object({
  projectId: z.string().min(1).optional(),
  executionId: z.string().min(1).optional(),
  evalCaseId: z.string().min(1).optional()
});

export const createEvalRunBodySchema = createEvalRunSchema.omit({ organizationId: true });

export const createEvalCaseBodySchema = createEvalCaseSchema.omit({ organizationId: true });

export const evalCaseListQuerySchema = z.object({
  taskContractId: z.string().min(1).optional()
});

export const runEvalSuiteBodySchema = z.object({
  taskContractId: z.string().min(1).optional(),
  projectId: z.string().min(1).optional()
});
