import { z } from "zod";

export const taskContractSchema = z.object({
  organizationId: z.string().min(1),
  projectId: z.string().min(1),
  taskId: z.string().min(1).optional(),
  agentId: z.string().min(1).optional(),
  name: z.string().min(1),
  version: z.number().int().positive().default(1),
  objective: z.string().min(1),
  inputs: z.record(z.unknown()).default({}),
  successCriteria: z.array(z.string().min(1)).default([]),
  allowedTools: z.array(z.string().min(1)).default([]),
  requiredApprovals: z.array(z.string().min(1)).default([]),
  evalSpec: z.record(z.unknown()).default({})
});

export const taskContractEvaluationSchema = z.object({
  contractId: z.string().min(1),
  executionId: z.string().min(1),
  checks: z.array(
    z.object({
      name: z.string().min(1),
      passed: z.boolean(),
      message: z.string().optional()
    })
  ),
  score: z.number().min(0).max(1),
  threshold: z.number().min(0).max(1)
});

export type TaskContractInput = z.infer<typeof taskContractSchema>;
export type TaskContractEvaluation = z.infer<typeof taskContractEvaluationSchema>;
