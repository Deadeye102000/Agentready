import { z } from "zod";

export const registerBodySchema = z.object({
  email: z.string().email().transform((value) => value.toLowerCase()),
  password: z.string().min(12).max(256),
  name: z.string().min(1).max(120).optional(),
  organizationName: z.string().min(1).max(160)
});

export const loginBodySchema = z.object({
  email: z.string().email().transform((value) => value.toLowerCase()),
  password: z.string().min(1).max(256)
});
