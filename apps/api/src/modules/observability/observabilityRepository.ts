import type { PrismaClient } from "@agentready/db";

export class ObservabilityRepository {
  constructor(private readonly prisma: PrismaClient) {}

  findOrganization(input: { organizationId: string }) {
    return this.prisma.organization.findUnique({
      where: { id: input.organizationId },
      select: { id: true, name: true, slug: true }
    });
  }

  async getDashboard(input: { organizationId: string }) {
    const organization = await this.findOrganization(input);
    if (!organization) {
      return null;
    }

    // PERFORMANCE OPTIMIZATION: Combine multiple count queries into groupBys to reduce database roundtrips.
    // This reduces the number of initial DB queries for dashboard metrics from 8 separate counts to 4 grouped queries,
    // saving network latency and connection pool usage overhead.
    const [
      agentExecutionGroups,
      toolCallTraceGroups,
      evalRunGroups,
      pendingApprovals,
      recentExecutions,
      recentToolCalls,
      recentEvalRuns,
      approvalGates,
      featureFlags,
      mcpServers,
      pendingApprovalsList
    ] = await Promise.all([
      this.prisma.agentExecution.groupBy({
        by: ['status'],
        where: { organizationId: organization.id },
        _count: { _all: true }
      }),
      this.prisma.toolCallTrace.groupBy({
        by: ['status'],
        where: { organizationId: organization.id },
        _count: { _all: true }
      }),
      this.prisma.evalRun.groupBy({
        by: ['status'],
        where: { organizationId: organization.id },
        _count: { _all: true }
      }),
      this.prisma.approvalRequest.count({ where: { organizationId: organization.id, status: "PENDING" } }),
      this.prisma.agentExecution.findMany({
        where: { organizationId: organization.id },
        include: {
          agent: { select: { id: true, name: true } },
          contract: { select: { id: true, name: true, version: true } },
          _count: { select: { toolCallTraces: true, evalRuns: true } }
        },
        orderBy: [{ createdAt: "desc" }],
        take: 5
      }),
      this.prisma.toolCallTrace.findMany({
        where: { organizationId: organization.id },
        include: {
          agent: { select: { id: true, name: true } },
          execution: { select: { id: true, status: true, objective: true } }
        },
        orderBy: [{ startedAt: "desc" }],
        take: 8
      }),
      this.prisma.evalRun.findMany({
        where: { organizationId: organization.id },
        include: {
          contract: { select: { id: true, name: true, version: true } },
          execution: { select: { id: true, status: true } }
        },
        orderBy: [{ createdAt: "desc" }],
        take: 5
      }),
      this.prisma.approvalGate.findMany({
        where: { organizationId: organization.id },
        orderBy: [{ capability: "asc" }]
      }),
      this.prisma.agentFeatureFlag.findMany({
        where: { organizationId: organization.id },
        include: { agent: { select: { id: true, name: true } } },
        orderBy: [{ capability: "asc" }]
      }),
      this.prisma.mcpServerRegistration.findMany({
        where: { organizationId: organization.id },
        orderBy: [{ name: "asc" }]
      }),
      this.prisma.approvalRequest.findMany({
        where: { organizationId: organization.id, status: "PENDING" },
        include: { agent: { select: { id: true, name: true } } },
        orderBy: [{ createdAt: "desc" }],
        take: 10
      })
    ]);

    const executions = agentExecutionGroups.reduce((acc, curr) => acc + curr._count._all, 0);
    const waitingForApproval = agentExecutionGroups.find(g => g.status === "WAITING_FOR_APPROVAL")?._count._all ?? 0;
    const failedExecutions = agentExecutionGroups.find(g => g.status === "FAILED")?._count._all ?? 0;

    const toolCalls = toolCallTraceGroups.reduce((acc, curr) => acc + curr._count._all, 0);
    const blockedToolCalls = toolCallTraceGroups.find(g => g.status === "BLOCKED")?._count._all ?? 0;

    const evalRuns = evalRunGroups.reduce((acc, curr) => acc + curr._count._all, 0);
    const passedEvalRuns = evalRunGroups.find(g => g.status === "PASSED")?._count._all ?? 0;

    return {
      organization,
      metrics: {
        executions,
        waitingForApproval,
        failedExecutions,
        toolCalls,
        blockedToolCalls,
        pendingApprovals,
        evalRuns,
        passedEvalRuns
      },
      recentExecutions,
      recentToolCalls,
      recentEvalRuns,
      approvalGates,
      featureFlags,
      mcpServers,
      pendingApprovalsList
    };
  }
}
