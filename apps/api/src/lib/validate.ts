import type { z } from "zod";

export function validateBody<TSchema extends z.ZodTypeAny>(schema: TSchema, body: unknown): z.infer<TSchema> {
  return schema.parse(body);
}
