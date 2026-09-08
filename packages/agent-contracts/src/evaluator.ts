import { TrajectoryPolicy, ExpectedStep } from './schemas/trajectory.js';

export interface TraceRecord {
  stepIndex?: number;
  toolName: string;
  inputPayload: unknown;
  outputPayload?: unknown;
  gateStatus?: string;
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
  traces: TraceRecord[],
  policy: TrajectoryPolicy
): TrajectoryEvaluation {
  const violations: string[] = [];
  const { mode, expectedSteps, forbiddenTools = [], maxToolCalls } = policy;

  if (maxToolCalls && traces.length > maxToolCalls) {
    violations.push(`Max tool calls exceeded: executed ${traces.length}, limit ${maxToolCalls}`);
  }

  for (const trace of traces) {
    if (forbiddenTools.includes(trace.toolName)) {
      violations.push(`Forbidden tool executed: "${trace.toolName}" at step ${trace.stepIndex ?? 'unknown'}`);
    }
  }

  let matchedSteps = 0;
  let traceIdx = 0;

  for (let i = 0; i < expectedSteps.length; i++) {
    const expected = expectedSteps[i];
    let stepMatched = false;

    if (mode === 'STRICT_SEQUENCE') {
      const trace = traces[traceIdx];
      if (trace && matchStep(trace, expected)) {
        stepMatched = true;
        traceIdx++;
      }
    } else if (mode === 'SUBSEQUENCE') {
      while (traceIdx < traces.length) {
        if (matchStep(traces[traceIdx], expected)) {
          stepMatched = true;
          traceIdx++;
          break;
        }
        traceIdx++;
      }
    } else if (mode === 'UNORDERED') {
      const found = traces.some((trace) => matchStep(trace, expected));
      if (found) stepMatched = true;
    }

    if (stepMatched) {
      matchedSteps++;
    } else if (expected.required !== false) {
      violations.push(`Missing expected step [${i}]: tool "${expected.tool}"`);
    }
  }

  const requiredCount = expectedSteps.filter(s => s.required !== false).length;
  const score = requiredCount === 0 ? 1.0 : matchedSteps / requiredCount;

  return {
    passed: violations.length === 0 && score === 1.0,
    score: Number(score.toFixed(2)),
    matchedSteps,
    totalExpected: requiredCount,
    violations,
  };
}

function matchStep(trace: TraceRecord, expected: ExpectedStep): boolean {
  if (trace.toolName !== expected.tool) return false;
  if (expected.expectedGateStatus && trace.gateStatus !== expected.expectedGateStatus) {
    return false;
  }
  if (expected.expectedArgs) {
    const traceArgs = (trace.inputPayload || {}) as Record<string, unknown>;
    for (const [key, val] of Object.entries(expected.expectedArgs)) {
      if (JSON.stringify(traceArgs[key]) !== JSON.stringify(val)) {
        return false;
      }
    }
  }
  return true;
}
