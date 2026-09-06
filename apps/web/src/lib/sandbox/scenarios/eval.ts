import { NextResponse } from "next/server";
import { fetchFromBackend } from "../client";

export async function handleEvalScenario(request: Request) {
  try {
    // 1. Log a real eval run record in Fastify
    const result = await fetchFromBackend(
      "/api/v1/eval-runs",
      {
        method: "POST",
        body: JSON.stringify({
          projectId: "demo-project",
          agentId: "demo-agent-identity",
          contractId: "demo-contract-id",
          executionId: "demo-agent-execution",
          name: "Sales Agent v2.0 CI/CD Verification",
          status: "PASSED",
          score: 0.98,
          threshold: 0.85,
          checks: [
            { name: "tool_calling_correctness", passed: true },
            { name: "no_hallucinations", passed: true },
            { name: "policy_compliance", passed: true }
          ],
          findings: ["Tool calling correctness is at 98%, up 2% from baseline. Hallucination rate is 0.1%."]
        })
      },
      request,
      "session"
    );

    // 2. Fetch the latest regression delta calculations
    let regressionDelta = { delta: 0.02, previousScore: 0.96, currentScore: 0.98 };
    try {
      const regression = await fetchFromBackend("/api/v1/eval-runs/regression", {}, request, "session");
      regressionDelta = {
        delta: regression.delta || 0.02,
        previousScore: regression.previousScore || 0.96,
        currentScore: regression.currentScore || 0.98
      };
    } catch (regErr) {
      console.warn("[Sandbox] Could not fetch real regression data:", regErr);
    }

    return NextResponse.json({
      id: result.id,
      status: "SUCCEEDED",
      targetAgent: "sales_agent_v2",
      compareAgainst: "baseline_v1",
      toolCallingCorrectness: "98%",
      toolCallingDelta: "+2%",
      hallucinationRate: "0.1%",
      regression: regressionDelta,
      mode: "live"
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: `Eval simulation failed to execute against backend: ${err.message}` },
      { status: err.status || 502 }
    );
  }
}
