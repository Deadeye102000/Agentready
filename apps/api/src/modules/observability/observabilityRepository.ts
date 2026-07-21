import type { PrismaClient } from "@agentready/db";

export class ObservabilityRepository {
  constructor(private readonly prisma: PrismaClient) {}

  findOrganization(input: { organizationId: string }) {
    return this.prisma.organization.findFirst({
      where: {
        OR: [{ id: input.organizationId }, { slug: input.organizationId }]
      },
      select: { id: true, name: true, slug: true }
    });
  }

  async getDashboard(input: { organizationId: string }) {
    const organization = await this.findOrganization(input);
    if (!organization) {
      return null;
    }

    const [
      executions,
      waitingForApproval,
      failedExecutions,
      toolCalls,
      blockedToolCalls,
      pendingApprovals,
      evalRuns,
      passedEvalRuns,
      recentExecutions,
      recentToolCalls,
      recentEvalRuns,
      approvalGates,
      featureFlags,
      mcpServers
    ] = await Promise.all([
      this.prisma.agentExecution.count({ where: { organizationId: organization.id } }),
      this.prisma.agentExecution.count({
        where: { organizationId: organization.id, status: "WAITING_FOR_APPROVAL" }
      }),
      this.prisma.agentExecution.count({ where: { organizationId: organization.id, status: "FAILED" } }),
      this.prisma.toolCallTrace.count({ where: { organizationId: organization.id } }),
      this.prisma.toolCallTrace.count({ where: { organizationId: organization.id, status: "BLOCKED" } }),
      this.prisma.approvalRequest.count({ where: { organizationId: organization.id, status: "PENDING" } }),
      this.prisma.evalRun.count({ where: { organizationId: organization.id } }),
      this.prisma.evalRun.count({ where: { organizationId: organization.id, status: "PASSED" } }),
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
      })
    ]);

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
      mcpServers
    };
  }
}
