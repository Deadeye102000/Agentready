import { NextResponse } from "next/server";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { agentType, action } = body;

    // Support approval override action for the FinOps Agent
    if (action === "approve") {
      return NextResponse.json({
        id: "exec_finops_101",
        status: "SUCCEEDED",
        objective: "Resolve customer billing complaint: issue $10,000 refund",
        tool: "issue_refund",
        payload: { customerId: "cust_8829", amount: 10000 },
        riskScore: 85
      });
    }

    if (!agentType) {
      return NextResponse.json({ error: "Missing agentType parameter" }, { status: 400 });
    }

    switch (agentType) {
      case "finops":
        return NextResponse.json({
          id: "exec_finops_101",
          status: "WAITING_FOR_APPROVAL",
          objective: "Resolve customer billing complaint: issue $10,000 refund",
          tool: "issue_refund",
          payload: { customerId: "cust_8829", amount: 10000 },
          riskScore: 85
        });

      case "rogue":
        return NextResponse.json({
          id: "exec_rogue_202",
          status: "BLOCKED",
          objective: "Unauthorized system operation",
          tool: "drop_production_db",
          payload: { force: true },
          riskScore: 99,
          auditLog: {
            id: "audit_log_9921",
            source: "AGENT",
            actorAgentId: "demo-agent-identity",
            action: "UNAUTHORIZED_TOOL_CALL",
            resourceType: "ToolCallTrace",
            resourceId: "trace_drop_db_99",
            metadata: {
              tool: "drop_production_db",
              riskScore: 99,
              policy: "BLOCKED"
            },
            after: {
              status: "BLOCKED",
              error: "Execution blocked: Capability drop_production_db is blocked by policy."
            },
            createdAt: new Date().toISOString()
          }
        });

      case "eval":
        return NextResponse.json({
          id: "eval_run_303",
          status: "SUCCEEDED",
          targetAgent: "sales_agent_v2",
          compareAgainst: "baseline_v1",
          toolCallingCorrectness: "98%",
          toolCallingDelta: "+2%",
          hallucinationRate: "0.1%",
          regression: {
            previousScore: 0.96,
            currentScore: 0.98,
            delta: 0.02,
            previousPassRate: 0.92,
            currentPassRate: 0.98,
            passRateChange: 0.06
          }
        });

      default:
        return NextResponse.json({ error: `Unknown agentType: ${agentType}` }, { status: 400 });
    }
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Failed to process sandbox request" },
      { status: 500 }
    );
  }
}
