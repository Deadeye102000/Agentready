import { z } from "zod";

export const auditLogListQuerySchema = z.object({
  limit: z.coerce.number().int().positive().max(100).optional()
});
