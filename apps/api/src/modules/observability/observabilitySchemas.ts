import { z } from "zod";

export const dashboardQuerySchema = z.object({
  refresh: z.coerce.boolean().optional()
});
