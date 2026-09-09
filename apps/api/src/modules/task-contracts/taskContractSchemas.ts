import { taskContractSchema, TrajectoryPolicySchema } from "@agentready/agent-contracts";
import { z } from "zod";

export const taskContractListQuerySchema = z.object({
  projectId: z.string().min(1).optional()
});

export const taskContractParamsSchema = z.object({
  id: z.string().min(1)
});

export const createTaskContractBodySchema = taskContractSchema.omit({ organizationId: true });

export const patchTaskContractBodySchema = z
  .object({
    trajectoryPolicy: TrajectoryPolicySchema.optional(),
    name: z.string().min(1).optional(),
    objective: z.string().min(1).optional(),
    version: z.number().int().positive().optional(),
    allowedTools: z.array(z.string().min(1)).optional(),
    requiredApprovals: z.array(z.string().min(1)).optional(),
    successCriteria: z.array(z.string().min(1)).optional(),
    inputs: z.record(z.unknown()).optional(),
    evalSpec: z.record(z.unknown()).optional()
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: "At least one field must be provided for update"
  });

export type PatchTaskContractBody = z.infer<typeof patchTaskContractBodySchema>;
