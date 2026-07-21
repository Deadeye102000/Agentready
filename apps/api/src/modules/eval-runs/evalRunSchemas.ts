import { createEvalRunSchema } from "@agentready/shared";
import { z } from "zod";

export const evalRunListQuerySchema = z.object({
  projectId: z.string().min(1).optional(),
  executionId: z.string().min(1).optional()
});

export const createEvalRunBodySchema = createEvalRunSchema.omit({ organizationId: true });
