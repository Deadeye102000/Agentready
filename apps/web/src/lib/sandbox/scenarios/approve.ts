import { NextResponse } from "next/server";
import { fetchFromBackend } from "../client";

export async function handleApproveScenario(request: Request, executionId: string) {
  try {
    const approvals = await fetchFromBackend(
      "/api/v1/approval-requests?status=PENDING",
      { method: "GET" },
      request,
      "session"
    );

    // Find the pending approval request linked to this execution
    const matchingApproval = approvals.find((a: any) => {
      const p = a.payload;
      return p && typeof p === "object" && p.executionId === executionId;
    });

    if (matchingApproval) {
      // Review (Approve) the request in the governance registry
      await fetchFromBackend(
        `/api/v1/approval-requests/${matchingApproval.id}/review`,
        {
          method: "POST",
          body: JSON.stringify({
            status: "APPROVED",
            note: "Approved via Live Sandbox Supervisor Action"
          })
        },
        request,
        "session"
      );
    }

    // Move the execution to SUCCEEDED state in Fastify to complete the demo loop
    try {
      await fetchFromBackend(
        `/api/v1/executions/${executionId}`,
        {
          method: "PATCH",
          body: JSON.stringify({
            status: "SUCCEEDED",
            output: { success: true, transactionId: "tx_sandbox_101" }
          })
        },
        request,
        "session"
      );
    } catch (patchErr) {
      console.warn("[Sandbox] Could not patch execution to SUCCEEDED directly:", patchErr);
    }

    return NextResponse.json({
      id: executionId,
      status: "SUCCEEDED",
      objective: "Resolve customer billing complaint: issue $10,000 refund",
      tool: "issue_refund",
      payload: { customerId: "cust_8829", amount: 10000 },
      riskScore: 85,
      mode: "live"
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: `Approval action failed: ${err.message}` },
      { status: err.status || 502 }
    );
  }
}
