import { upsertAgentFeatureFlagSchema, upsertApprovalGateSchema } from "@agentready/shared";
import { z } from "zod";

export const emptyQuerySchema = z.object({});

export const approvalRequestListQuerySchema = emptyQuerySchema.extend({
  status: z.enum(["PENDING", "APPROVED", "REJECTED", "EXPIRED"]).optional()
});

export const approvalRequestParamsSchema = z.object({
  id: z.string().min(1)
});

export const reviewApprovalRequestBodySchema = z.object({
  status: z.enum(["APPROVED", "REJECTED"]),
  note: z.string().optional()
});

export const approvalGateBodySchema = upsertApprovalGateSchema.omit({ organizationId: true });
export const featureFlagBodySchema = upsertAgentFeatureFlagSchema.omit({ organizationId: true });
