import { z } from 'zod';

export const TrajectoryModeEnum = z.enum(['STRICT_SEQUENCE', 'SUBSEQUENCE', 'UNORDERED']);
export type TrajectoryMode = z.infer<typeof TrajectoryModeEnum>;

export const ExpectedStepSchema = z.object({
  tool: z.string().min(1),
  required: z.boolean().default(true),
  expectedArgs: z.record(z.unknown()).optional(),
  expectedGateStatus: z.enum(['AUTOMATIC', 'REQUIRE_APPROVAL', 'BLOCKED']).optional(),
});
export type ExpectedStep = z.infer<typeof ExpectedStepSchema>;

export const TrajectoryPolicySchema = z.object({
  mode: TrajectoryModeEnum.default('SUBSEQUENCE'),
  expectedSteps: z.array(ExpectedStepSchema).min(1),
  forbiddenTools: z.array(z.string()).default([]),
  maxToolCalls: z.number().int().positive().optional(),
});
export type TrajectoryPolicy = z.infer<typeof TrajectoryPolicySchema>;
