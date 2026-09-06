import { NextResponse } from "next/server";
import { fetchFromBackend } from "../client";

export async function handleFinopsScenario(request: Request) {
  try {
    // 1. Setup the policy gate (Human path)
    await fetchFromBackend(
      "/api/v1/approval-gates",
      {
        method: "PUT",
        body: JSON.stringify({
          capability: "issue_refund",
          mode: "REQUIRE_APPROVAL",
          riskLevel: 80,
          reason: "Large refund requests require human manager authorization."
        })
      },
      request,
      "session"
    );

    // 2. Locate or create a task contract for this agent
    let contractId = "demo-contract-id";
    const contracts = await fetchFromBackend("/api/v1/task-contracts", { method: "GET" }, request, "session");
    const existingContract = contracts.find((c: any) => c.name === "Refund processing contract");
    if (existingContract) {
      contractId = existingContract.id;
    } else {
      const newContract = await fetchFromBackend(
        "/api/v1/task-contracts",
        {
          method: "POST",
          body: JSON.stringify({
            projectId: "demo-project",
            taskId: "demo-task-agent-created",
            agentId: "demo-agent-identity",
            name: "Refund processing contract",
            version: 1,
            objective: "Resolve customer complaint by issuing a refund",
            inputs: { customerId: "cust_8829", amount: 10000 },
            successCriteria: ["Refund issued safely", "Leaves audit trace"],
            allowedTools: ["issue_refund"],
            requiredApprovals: ["issue_refund"],
            evalSpec: { minScore: 1.0, checks: [] }
          })
        },
        request,
        "session"
      );
      contractId = newContract.id;
    }

    // 3. Trigger the execution using the M2M Bearer token
    const execution = await fetchFromBackend(
      "/api/v1/executions",
      {
        method: "POST",
        body: JSON.stringify({
          projectId: "demo-project",
          agentId: "demo-agent-identity",
          contractId: contractId,
          objective: "Resolve customer billing complaint: issue $10,000 refund",
          input: { customerId: "cust_8829", amount: 10000 },
          riskScore: 85
        })
      },
      request,
      "bearer"
    );

    return NextResponse.json({
      id: execution.id,
      status: execution.status,
      objective: "Resolve customer billing complaint: issue $10,000 refund",
      tool: "issue_refund",
      payload: { customerId: "cust_8829", amount: 10000 },
      riskScore: 85,
      mode: "live"
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: `FinOps simulation failed to execute against backend: ${err.message}` },
      { status: err.status || 502 }
    );
  }
}
