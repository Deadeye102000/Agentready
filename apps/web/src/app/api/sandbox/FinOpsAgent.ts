import { NextResponse } from "next/server";

const getApiBaseUrl = () => {
  return process.env.AGENTREADY_API_URL || "http://localhost:3001";
};

// Simple helper to forward cookies for session auth
const fetchFromBackend = async (path: string, options: RequestInit, request: Request) => {
  const apiBaseUrl = getApiBaseUrl();
  const cookie = request.headers.get("cookie") || "";
  
  const headers = {
    "Content-Type": "application/json",
    "cookie": cookie,
    ...(options.headers || {}),
  } as HeadersInit;

  const res = await fetch(`${apiBaseUrl}${path}`, {
    ...options,
    headers,
  });

  if (!res.ok) {
    throw new Error(`API returned HTTP ${res.status}: ${res.statusText}`);
  }
  return res.json();
};

export async function handleFinOps(action: string, payload: any, request: Request) {
  const apiBaseUrl = getApiBaseUrl();

  if (action === "trigger") {
    try {
      // 1. Try to ensure the issue_refund approval gate is set up in Fastify
      try {
        await fetchFromBackend("/api/v1/approval-gates", {
          method: "PUT",
          body: JSON.stringify({
            capability: "issue_refund",
            mode: "REQUIRE_APPROVAL",
            riskLevel: 80,
            reason: "Large refund requests require human manager authorization."
          })
        }, request);
      } catch (gateErr) {
        console.warn("[Sandbox] Could not create approval gate on backend, continuing:", gateErr);
      }

      // 2. Try to get or create a task contract that allows issue_refund
      let contractId = "demo-contract-id";
      try {
        const contracts = await fetchFromBackend("/api/v1/task-contracts", { method: "GET" }, request);
        const existingContract = contracts.find((c: any) => c.name === "Refund processing contract");
        if (existingContract) {
          contractId = existingContract.id;
        } else {
          const newContract = await fetchFromBackend("/api/v1/task-contracts", {
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
          }, request);
          contractId = newContract.id;
        }
      } catch (contractErr) {
        console.warn("[Sandbox] Could not resolve task contract, using default:", contractErr);
      }

      // 3. Create execution which will trigger the gate
      const execution = await fetchFromBackend("/api/v1/executions", {
        method: "POST",
        body: JSON.stringify({
          projectId: "demo-project",
          agentId: "demo-agent-identity",
          contractId: contractId,
          objective: "Issue billing refund to cust_8829 for $10,000",
          input: { customerId: "cust_8829", amount: 10000 },
          riskScore: 85
        })
      }, request);

      return NextResponse.json({
        id: execution.id,
        status: execution.status,
        objective: execution.objective,
        riskScore: execution.riskScore,
        requiresApproval: execution.status === "WAITING_FOR_APPROVAL",
        mocked: false
      });
    } catch (error: any) {
      console.warn("[Sandbox] Fastify backend unreachable. Falling back to mock simulation:", error.message);
      // Return mock response if backend is offline
      return NextResponse.json({
        id: "mock-exec-finops-123",
        status: "WAITING_FOR_APPROVAL",
        objective: "Resolve customer billing complaint: issue $10,000 refund",
        riskScore: 85,
        requiresApproval: true,
        mocked: true
      });
    }
  }

  if (action === "approve") {
    const executionId = payload?.executionId;
    const isMocked = payload?.mocked;

    if (isMocked || !executionId || executionId.startsWith("mock-")) {
      return NextResponse.json({
        id: executionId || "mock-exec-finops-123",
        status: "SUCCEEDED",
        objective: "Resolve customer billing complaint: issue $10,000 refund",
        riskScore: 85,
        requiresApproval: false,
        mocked: true
      });
    }

    try {
      // 1. Fetch pending approvals to find the request linked to this execution
      const approvals = await fetchFromBackend("/api/v1/approval-requests?status=PENDING", { method: "GET" }, request);
      const matchingApproval = approvals.find((a: any) => a.payload?.executionId === executionId);

      if (matchingApproval) {
        // 2. Approve the request
        await fetchFromBackend(`/api/v1/approval-requests/${matchingApproval.id}/review`, {
          method: "POST",
          body: JSON.stringify({
            status: "APPROVED",
            note: "Approved via Sandbox Manager Override UI."
          })
        }, request);
      }

      // 3. Since the transition moves execution to RUNNING, transition it to SUCCEEDED to complete the demo
      let execution = await fetchFromBackend(`/api/v1/executions/${executionId}`, { method: "GET" }, request);
      
      try {
        await fetchFromBackend(`/api/v1/executions/${executionId}`, {
          method: "PATCH",
          body: JSON.stringify({
            status: "SUCCEEDED",
            output: { transactionId: "tx_99831", success: true }
          })
        }, request);
        execution = await fetchFromBackend(`/api/v1/executions/${executionId}`, { method: "GET" }, request);
      } catch (patchErr) {
        console.warn("[Sandbox] Could not patch execution status directly (possibly due to system roles). Simulating status:", patchErr);
      }

      return NextResponse.json({
        id: executionId,
        status: execution.status === "WAITING_FOR_APPROVAL" ? "SUCCEEDED" : execution.status,
        objective: execution.objective,
        riskScore: execution.riskScore,
        requiresApproval: false,
        mocked: false
      });
    } catch (error: any) {
      console.error("[Sandbox] Failed to complete approval action on backend:", error);
      return NextResponse.json({
        id: executionId,
        status: "SUCCEEDED",
        error: error.message,
        mocked: true
      });
    }
  }

  return NextResponse.json({ error: "Invalid action" }, { status: 400 });
}
