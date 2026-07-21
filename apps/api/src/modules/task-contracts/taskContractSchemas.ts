import { taskContractSchema } from "@agentready/agent-contracts";
import { z } from "zod";

export const taskContractListQuerySchema = z.object({
  projectId: z.string().min(1).optional()
});

export const taskContractParamsSchema = z.object({
  id: z.string().min(1)
});

export const createTaskContractBodySchema = taskContractSchema.omit({ organizationId: true });
