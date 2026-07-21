import { upsertAgentFeatureFlagSchema, upsertApprovalGateSchema } from "@agentready/shared";
import { z } from "zod";

export const organizationQuerySchema = z.object({
  organizationId: z.string().min(1)
});

export const approvalRequestListQuerySchema = organizationQuerySchema.extend({
  status: z.enum(["PENDING", "APPROVED", "REJECTED", "EXPIRED"]).optional()
});

export const approvalRequestParamsSchema = z.object({
  id: z.string().min(1)
});

export const reviewApprovalRequestBodySchema = z.object({
  organizationId: z.string().min(1),
  status: z.enum(["APPROVED", "REJECTED"]),
  reviewedByUserId: z.string().min(1),
  note: z.string().optional()
});

export const approvalGateBodySchema = upsertApprovalGateSchema;
export const featureFlagBodySchema = upsertAgentFeatureFlagSchema;
