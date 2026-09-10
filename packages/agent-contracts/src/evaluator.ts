import { TrajectoryPolicy, ExpectedStep } from "./schemas/trajectory.js";

export interface TraceRecord {
  stepIndex?: number;
  step_index?: number;
  toolName?: string;
  tool_name?: string;
  inputPayload?: unknown;
  input_payload?: unknown;
  gateStatus?: string;
  gate_status?: string;
  error?: string | null;
}

export interface TrajectoryEvaluation {
  passed: boolean;
  score: number; // 0.0 to 1.0
  matchedSteps: number;
  totalExpected: number;
  violations: string[];
}

export function evaluateTrajectoryTraces(
  traces: (TraceRecord | Record<string, any>)[],
  policy: TrajectoryPolicy | Record<string, any>
): TrajectoryEvaluation {
  const violations: string[] = [];
  const mode = policy.mode;
  const expectedSteps: any[] = (policy as any).expectedSteps ?? (policy as any).expected_steps ?? [];
  const forbiddenTools: string[] = (policy as any).forbiddenTools ?? (policy as any).forbidden_tools ?? [];
  const maxToolCalls: number | undefined = (policy as any).maxToolCalls ?? (policy as any).max_tool_calls;

  if (maxToolCalls && traces.length > maxToolCalls) {
    violations.push(`Max tool calls exceeded: executed ${traces.length}, limit ${maxToolCalls}`);
  }

  for (const trace of traces) {
    const toolName = (trace as any).toolName ?? (trace as any).tool_name;
    const stepIndex = (trace as any).stepIndex ?? (trace as any).step_index ?? "unknown";
    if (forbiddenTools.includes(toolName)) {
      violations.push(`Forbidden tool executed: \"${toolName}\" at step ${stepIndex}`);
    }
  }

  let matchedSteps = 0;
  let traceIdx = 0;

  for (let i = 0; i < expectedSteps.length; i++) {
    const expected = expectedSteps[i];
    let stepMatched = false;

    if (mode === "STRICT_SEQUENCE") {
      const trace = traces[traceIdx];
      if (trace && matchStep(trace, expected)) {
        stepMatched = true;
        traceIdx++;
      }
    } else if (mode === "SUBSEQUENCE") {
      while (traceIdx < traces.length) {
        if (matchStep(traces[traceIdx], expected)) {
          stepMatched = true;
          traceIdx++;
          break;
        }
        traceIdx++;
      }
    } else if (mode === "UNORDERED") {
      const found = traces.some((trace) => matchStep(trace, expected));
      if (found) stepMatched = true;
    }

    if (stepMatched) {
      matchedSteps++;
    } else if (expected.required !== false) {
      violations.push(`Missing expected step [${i}]: tool \"${expected.tool}\"`);
    }
  }

  const requiredCount = expectedSteps.filter(s => s.required !== false).length;
  const rawScore = requiredCount === 0 ? 1.0 : matchedSteps / requiredCount;
  const score = Math.min(1.0, rawScore);

  return {
    passed: violations.length === 0 && score === 1.0,
    score: Number(score.toFixed(2)),
    matchedSteps,
    totalExpected: requiredCount,
    violations,
  };
}

function matchStep(trace: TraceRecord | Record<string, any>, expected: ExpectedStep | Record<string, any>): boolean {
  const toolName = (trace as any).toolName ?? (trace as any).tool_name;
  if (toolName !== expected.tool) return false;

  const expectedGateStatus = (expected as any).expectedGateStatus ?? (expected as any).expected_gate_status;
  const gateStatus = (trace as any).gateStatus ?? (trace as any).gate_status;
  if (expectedGateStatus && gateStatus !== expectedGateStatus) {
    return false;
  }

  const expectedArgs = (expected as any).expectedArgs ?? (expected as any).expected_args;
  if (expectedArgs) {
    const traceArgs = ((trace as any).inputPayload ?? (trace as any).input_payload ?? {}) as Record<string, unknown>;
    for (const [key, val] of Object.entries(expectedArgs)) {
      if (JSON.stringify(traceArgs[key]) !== JSON.stringify(val)) {
        return false;
      }
    }
  }
  return true;
}
