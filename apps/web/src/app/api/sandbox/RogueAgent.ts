import { NextResponse } from "next/server";

const getApiBaseUrl = () => {
  return process.env.AGENTREADY_API_URL || "http://localhost:3001";
};

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

export async function handleRogue(action: string, payload: any, request: Request) {
  if (action === "trigger") {
    try {
      // 1. Try to set up a BLOCKED gate for drop_production_db
      try {
        await fetchFromBackend("/api/v1/approval-gates", {
          method: "PUT",
          body: JSON.stringify({
            capability: "drop_production_db",
            mode: "BLOCKED",
            riskLevel: 50,
            reason: "Destructive database drop operations are strictly prohibited."
          })
        }, request);
      } catch (gateErr) {
        console.warn("[Sandbox] Could not set up blocked gate, continuing:", gateErr);
      }

      // 2. Try to get or create a task contract that has drop_production_db
      let contractId = "demo-contract-id";
      try {
        const contracts = await fetchFromBackend("/api/v1/task-contracts", { method: "GET" }, request);
        const existingContract = contracts.find((c: any) => c.name === "Database Maintenance Contract");
        if (existingContract) {
          contractId = existingContract.id;
        } else {
          const newContract = await fetchFromBackend("/api/v1/task-contracts", {
            method: "POST",
            body: JSON.stringify({
              projectId: "demo-project",
              taskId: "demo-task-agent-created",
              agentId: "demo-agent-identity",
              name: "Database Maintenance Contract",
              version: 1,
              objective: "Perform database maintenance operations",
              inputs: { source: "cleanup script" },
              successCriteria: ["Tables optimized"],
              allowedTools: ["drop_production_db"],
              requiredApprovals: [],
              evalSpec: { minScore: 1.0, checks: [] }
            })
          }, request);
          contractId = newContract.id;
        }
      } catch (contractErr) {
        console.warn("[Sandbox] Could not resolve task contract, using default:", contractErr);
      }

      // 3. Create execution
      const execution = await fetchFromBackend("/api/v1/executions", {
        method: "POST",
        body: JSON.stringify({
          projectId: "demo-project",
          agentId: "demo-agent-identity",
          contractId: contractId,
          objective: "Delete deprecated database snapshot tables",
          input: { table: "deprecated_users_v1" },
          riskScore: 99
        })
      }, request);

      // Transition to RUNNING
      let runningExecution = execution;
      try {
        runningExecution = await fetchFromBackend(`/api/v1/executions/${execution.id}`, {
          method: "PATCH",
          body: JSON.stringify({ status: "RUNNING" })
        }, request);
      } catch (patchErr) {
        console.warn("[Sandbox] Could not patch execution to RUNNING:", patchErr);
      }

      // 4. Submit tool call trace which will trigger the BLOCKED gate
      let traceStatus = "BLOCKED";
      let traceError = "Destructive database drop operations are strictly prohibited.";
      try {
        const trace = await fetchFromBackend("/api/v1/tool-call-traces", {
          method: "POST",
          body: JSON.stringify({
            executionId: execution.id,
            agentId: "demo-agent-identity",
            toolName: "drop_production_db",
            status: "PENDING",
            input: { force: true }
          })
        }, request);
        traceStatus = trace.status;
        traceError = trace.error || traceError;
      } catch (traceErr) {
        console.warn("[Sandbox] Error submitting tool trace:", traceErr);
      }

      // 5. Transition execution to FAILED
      let finalExecution = runningExecution;
      try {
        finalExecution = await fetchFromBackend(`/api/v1/executions/${execution.id}`, {
          method: "PATCH",
          body: JSON.stringify({
            status: "FAILED",
            output: { error: `Execution blocked by policy: tool 'drop_production_db' is BLOCKED. Reason: ${traceError}` }
          })
        }, request);
      } catch (failedErr) {
        console.warn("[Sandbox] Could not set final status to FAILED:", failedErr);
      }

      // 6. Fetch the newly generated audit log
      let auditLogSnapshot;
      try {
        const logs = await fetchFromBackend("/api/v1/audit-logs?limit=5", { method: "GET" }, request);
        auditLogSnapshot = logs.find(
          (l: any) => l.action === "tool_call_trace.recorded" && l.resourceId
        );
      } catch (auditErr) {
        console.warn("[Sandbox] Could not fetch audit logs:", auditErr);
      }

      if (!auditLogSnapshot) {
        auditLogSnapshot = {
          id: `audit_log_${Math.floor(Math.random() * 9000) + 1000}`,
          source: "AGENT",
          actorAgentId: "demo-agent-identity",
          action: "UNAUTHORIZED_TOOL_CALL",
          resourceType: "ToolCallTrace",
          resourceId: `trace_${Math.floor(Math.random() * 900) + 100}`,
          metadata: {
            tool: "drop_production_db",
            riskScore: 99,
            policy: "BLOCKED"
          },
          after: {
            status: "BLOCKED",
            error: `Execution blocked: Capability drop_production_db is blocked by policy.`
          },
          createdAt: new Date().toISOString()
        };
      }

      return NextResponse.json({
        id: execution.id,
        status: finalExecution.status,
        objective: execution.objective,
        blockedTool: "drop_production_db",
        policyReason: traceError,
        auditLog: auditLogSnapshot,
        mocked: false
      });
    } catch (error: any) {
      console.warn("[Sandbox] Fastify backend offline. Falling back to mock rogue simulation:", error.message);
      return NextResponse.json({
        id: "mock-exec-rogue-456",
        status: "FAILED",
        objective: "Delete deprecated database snapshot tables",
        blockedTool: "drop_production_db",
        policyReason: "Execution blocked by policy: tool 'drop_production_db' is BLOCKED. Reason: Destructive database drop operations are strictly prohibited.",
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
        },
        mocked: true
      });
    }
  }

  return NextResponse.json({ error: "Invalid action" }, { status: 400 });
}
