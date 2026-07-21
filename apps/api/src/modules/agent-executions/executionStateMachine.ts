import type { AgentExecutionStatus } from "@agentready/db";
import { HttpError } from "../../lib/httpError.js";

const terminalStatuses = new Set<AgentExecutionStatus>(["SUCCEEDED", "FAILED", "CANCELLED"]);

const allowedTransitions: Record<AgentExecutionStatus, AgentExecutionStatus[]> = {
  QUEUED: ["RUNNING", "CANCELLED"],
  RUNNING: ["WAITING_FOR_APPROVAL", "SUCCEEDED", "FAILED", "CANCELLED"],
  WAITING_FOR_APPROVAL: ["RUNNING", "SUCCEEDED", "FAILED", "CANCELLED"],
  SUCCEEDED: [],
  FAILED: [],
  CANCELLED: []
};

export function assertExecutionTransition(from: AgentExecutionStatus, to: AgentExecutionStatus) {
  if (from === to) {
    return;
  }

  if (!allowedTransitions[from].includes(to)) {
    throw new HttpError({
      code: "VALIDATION_ERROR",
      message: `Cannot transition agent execution from ${from} to ${to}`,
      statusCode: 400
    });
  }
}

export function isTerminalExecutionStatus(status: AgentExecutionStatus) {
  return terminalStatuses.has(status);
}
