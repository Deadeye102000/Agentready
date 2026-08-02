import { ObservabilityRepository } from "./observabilityRepository.js";

const emptyDashboard = {
  organization: null,
  metrics: {
    executions: 0,
    waitingForApproval: 0,
    failedExecutions: 0,
    toolCalls: 0,
    blockedToolCalls: 0,
    pendingApprovals: 0,
    evalRuns: 0,
    passedEvalRuns: 0
  },
  recentExecutions: [],
  recentToolCalls: [],
  recentEvalRuns: [],
  approvalGates: [],
  featureFlags: [],
  mcpServers: [],
  pendingApprovalsList: []
};

export class ObservabilityService {
  constructor(private readonly observability: ObservabilityRepository) {}

  async getDashboard(input: { organizationId: string }) {
    return (await this.observability.getDashboard(input)) ?? emptyDashboard;
  }
}
