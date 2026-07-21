import { z } from "zod";

export const dashboardQuerySchema = z.object({
  organizationId: z.string().min(1).default("demo-org")
});
