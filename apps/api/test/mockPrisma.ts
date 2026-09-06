import { prisma } from "../src/lib/prisma.js";
import type { Prisma, AgentExecutionStatus } from "@agentready/db";

export interface MockStore {
  users: any[];
  organizations: any[];
  memberships: any[];
  projects: any[];
  tasks: any[];
  taskContracts: any[];
  agentIdentities: any[];
  agentExecutions: any[];
  toolCallTraces: any[];
  auditLogs: any[];
  evalRuns: any[];
  featureFlags: any[];
  approvalGates: any[];
  approvalRequests: any[];
  evalCases: any[];
  apiKeys: any[];
  idempotencyKeys: any[];
  mcpServerRegistrations: any[];
}

export const mockStore: MockStore = {
  users: [],
  organizations: [],
  memberships: [],
  projects: [],
  tasks: [],
  taskContracts: [],
  agentIdentities: [],
  agentExecutions: [],
  toolCallTraces: [],
  auditLogs: [],
  evalRuns: [],
  featureFlags: [],
  approvalGates: [],
  approvalRequests: [],
  evalCases: [],
  apiKeys: [],
  idempotencyKeys: [],
  mcpServerRegistrations: [],
};

export function resetMockStore() {
  mockStore.users = [];
  mockStore.organizations = [];
  mockStore.memberships = [];
  mockStore.projects = [];
  mockStore.tasks = [];
  mockStore.taskContracts = [];
  mockStore.agentIdentities = [];
  mockStore.agentExecutions = [];
  mockStore.toolCallTraces = [];
  mockStore.auditLogs = [];
  mockStore.evalRuns = [];
  mockStore.featureFlags = [];
  mockStore.approvalGates = [];
  mockStore.approvalRequests = [];
  mockStore.evalCases = [];
  mockStore.apiKeys = [];
  mockStore.idempotencyKeys = [];
  mockStore.mcpServerRegistrations = [];
}

// Helper to generate IDs
function genId() {
  return Math.random().toString(36).substring(2, 15);
}

// Override prisma client methods
const mockPrisma = prisma as any;

// Users
mockPrisma.user.findUnique = async (args: any) => {
  const where = args.where;
  if (where.email) {
    const user = mockStore.users.find((u) => u.email === where.email);
    if (!user) return null;
    // include memberships
    const userMemberships = mockStore.memberships
      .filter((m) => m.userId === user.id)
      .map((m) => {
        const org = mockStore.organizations.find((o) => o.id === m.organizationId);
        return { ...m, organization: org };
      });
    return { ...user, memberships: userMemberships };
  }
  return null;
};

mockPrisma.user.findFirst = async (args: any) => {
  const where = args.where;
  const userId = where.id;
  const orgId = where.memberships?.some?.organizationId;
  const user = mockStore.users.find(
    (u) => u.id === userId && (!orgId || mockStore.memberships.some((m) => m.userId === u.id && m.organizationId === orgId))
  );
  if (!user) return null;
  const userMemberships = mockStore.memberships
    .filter((m) => m.userId === user.id && (!orgId || m.organizationId === orgId))
    .map((m) => {
      const org = mockStore.organizations.find((o) => o.id === m.organizationId);
      return { ...m, organization: org };
    });
  return { ...user, memberships: userMemberships };
};

mockPrisma.user.create = async (args: any) => {
  const data = args.data;
  const userId = genId();
  const orgId = genId();
  const membershipId = genId();

  const orgData = data.memberships?.create?.organization?.create;
  const organization = {
    id: orgId,
    name: orgData?.name || "Test Org",
    slug: orgData?.slug || "test-org",
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  mockStore.organizations.push(organization);

  const membership = {
    id: membershipId,
    userId,
    organizationId: orgId,
    role: data.memberships?.create?.role || "OWNER",
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  mockStore.memberships.push(membership);

  const user = {
    id: userId,
    email: data.email,
    name: data.name || null,
    passwordHash: data.passwordHash,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  mockStore.users.push(user);

  return {
    ...user,
    memberships: [{ ...membership, organization }],
  };
};

// Count queries for tenancy checks
mockPrisma.project.count = async (args: any) => {
  const where = args.where || {};
  return mockStore.projects.filter(
    (p) => (!where.id || p.id === where.id) && (!where.organizationId || p.organizationId === where.organizationId)
  ).length;
};

mockPrisma.task.count = async (args: any) => {
  const where = args.where || {};
  return mockStore.tasks.filter(
    (t) => (!where.id || t.id === where.id) && (!where.organizationId || t.organizationId === where.organizationId)
  ).length;
};

mockPrisma.agentIdentity.count = async (args: any) => {
  const where = args.where || {};
  return mockStore.agentIdentities.filter(
    (a) => (!where.id || a.id === where.id) && (!where.organizationId || a.organizationId === where.organizationId)
  ).length;
};

mockPrisma.agentIdentity.findFirst = async (args: any) => {
  const where = args.where || {};
  return mockStore.agentIdentities.find(
    (a) => (!where.id || a.id === where.id) && (!where.organizationId || a.organizationId === where.organizationId)
  ) || null;
};

mockPrisma.agentIdentity.create = async (args: any) => {
  const data = args.data;
  const item = {
    id: data.id || Math.random().toString(36).slice(2, 12),
    organizationId: data.organizationId,
    name: data.name,
    createdAt: new Date(),
    updatedAt: new Date()
  };
  mockStore.agentIdentities.push(item);
  return item;
};

mockPrisma.taskContract.count = async (args: any) => {
  const where = args.where || {};
  return mockStore.taskContracts.filter(
    (c) => (!where.id || c.id === where.id) && (!where.organizationId || c.organizationId === where.organizationId)
  ).length;
};

mockPrisma.taskContract.create = async (args: any) => {
  const data = args.data;
  const contract = {
    id: data.id || Math.random().toString(36).slice(2, 12),
    organizationId: data.organizationId,
    projectId: data.projectId || null,
    taskId: data.taskId || null,
    agentId: data.agentId || null,
    name: data.name,
    version: data.version ?? 1,
    objective: data.objective || "",
    inputs: data.inputs || {},
    successCriteria: data.successCriteria || [],
    allowedTools: data.allowedTools || [],
    requiredApprovals: data.requiredApprovals || [],
    evalSpec: data.evalSpec || {},
    fileContent: data.fileContent || null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  mockStore.taskContracts.push(contract);
  return contract;
};

mockPrisma.taskContract.findMany = async (args: any) => {
  const where = args.where || {};
  return mockStore.taskContracts.filter(
    (c) =>
      (!where.organizationId || c.organizationId === where.organizationId) &&
      (!where.projectId || c.projectId === where.projectId)
  );
};

mockPrisma.taskContract.findFirst = async (args: any) => {
  const where = args.where || {};
  return (
    mockStore.taskContracts.find(
      (c) =>
        (!where.id || c.id === where.id) &&
        (!where.organizationId || c.organizationId === where.organizationId)
    ) || null
  );
};



mockPrisma.agentExecution.count = async (args: any) => {
  const where = args.where || {};
  return mockStore.agentExecutions.filter(
    (e) =>
      (!where.id || e.id === where.id) &&
      (!where.organizationId || e.organizationId === where.organizationId) &&
      (!where.status || e.status === where.status)
  ).length;
};

// Executions
mockPrisma.agentExecution.create = async (args: any) => {
  const data = args.data;
  const execution = {
    id: genId(),
    organizationId: data.organizationId,
    projectId: data.projectId,
    taskId: data.taskId || null,
    contractId: data.contractId || null,
    agentId: data.agentId,
    status: data.status || "QUEUED",
    objective: data.objective,
    input: data.input || {},
    output: null,
    riskScore: data.riskScore || 0,
    // Worker-readiness fields
    maxAttempts: data.maxAttempts ?? 1,
    attemptCount: data.attemptCount ?? 0,
    timeoutMs: data.timeoutMs ?? null,
    timedOutAt: data.timedOutAt ?? null,
    failureReason: data.failureReason ?? null,
    startedAt: null,
    completedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  mockStore.agentExecutions.push(execution);
  return execution;
};

mockPrisma.agentExecution.findFirst = async (args: any) => {
  const where = args.where || {};
  const execution = mockStore.agentExecutions.find(
    (e) => (!where.id || e.id === where.id) && (!where.organizationId || e.organizationId === where.organizationId)
  );
  if (!execution) return null;

  const agent = mockStore.agentIdentities.find((a) => a.id === execution.agentId);
  const project = mockStore.projects.find((p) => p.id === execution.projectId);
  const contract = mockStore.taskContracts.find((c) => c.id === execution.contractId);
  const task = mockStore.tasks.find((t) => t.id === execution.taskId);
  const toolCallTraces = mockStore.toolCallTraces.filter((t) => t.executionId === execution.id);
  const evalRuns = mockStore.evalRuns.filter((er) => er.executionId === execution.id);

  return {
    ...execution,
    agent: agent ? { id: agent.id, name: agent.name } : null,
    project: project ? { id: project.id, name: project.name } : null,
    contract: contract || null,
    task: task || null,
    toolCallTraces,
    evalRuns,
  };
};

mockPrisma.agentExecution.updateMany = async (args: any) => {
  const { where, data } = args;
  const matches = mockStore.agentExecutions.filter(
    (e) => (!where.id || e.id === where.id) && (!where.organizationId || e.organizationId === where.organizationId)
  );
  for (const match of matches) {
    if (data.status !== undefined) match.status = data.status;
    if (data.output !== undefined) match.output = data.output;
    if (data.startedAt !== undefined) match.startedAt = data.startedAt;
    if (data.completedAt !== undefined) match.completedAt = data.completedAt;
    // Worker-readiness fields
    if (data.attemptCount !== undefined) match.attemptCount = data.attemptCount;
    if (data.timedOutAt !== undefined) match.timedOutAt = data.timedOutAt;
    if (data.failureReason !== undefined) match.failureReason = data.failureReason;
    match.updatedAt = new Date();
  }
  return { count: matches.length };
};

mockPrisma.agentExecution.update = async (args: any) => {
  const { where, data } = args;
  const match = mockStore.agentExecutions.find((e) => e.id === where.id);
  if (!match) {
    throw new Error(`AgentExecution not found: ${where.id}`);
  }
  if (data.status !== undefined) match.status = data.status;
  if (data.output !== undefined) match.output = data.output;
  if (data.startedAt !== undefined) match.startedAt = data.startedAt;
  if (data.completedAt !== undefined) match.completedAt = data.completedAt;
  if (data.attemptCount !== undefined) match.attemptCount = data.attemptCount;
  if (data.timedOutAt !== undefined) match.timedOutAt = data.timedOutAt;
  if (data.failureReason !== undefined) match.failureReason = data.failureReason;
  match.updatedAt = new Date();
  return match;
};

mockPrisma.agentExecution.findMany = async (args: any) => {
  const where = args.where || {};
  const matches = mockStore.agentExecutions.filter(
    (e) =>
      (!where.organizationId || e.organizationId === where.organizationId) &&
      (!where.projectId || e.projectId === where.projectId) &&
      (!where.status || e.status === where.status) &&
      (!where.failureReason || e.failureReason === where.failureReason)
  );
  return matches.map((e) => {
    const agent = mockStore.agentIdentities.find((a) => a.id === e.agentId);
    const contract = mockStore.taskContracts.find((c) => c.id === e.contractId);
    const task = mockStore.tasks.find((t) => t.id === e.taskId);
    return {
      ...e,
      agent: agent ? { id: agent.id, name: agent.name } : null,
      contract: contract ? { id: contract.id, name: contract.name, version: contract.version } : null,
      task: task ? { id: task.id, title: task.title, status: task.status } : null,
      _count: { toolCallTraces: 0, evalRuns: 0 },
    };
  });
};

// Tool Calls (for executions service calls)
mockPrisma.toolCallTrace.create = async (args: any) => {
  const data = args.data;
  const trace = {
    id: genId(),
    organizationId: data.organizationId,
    executionId: data.executionId,
    agentId: data.agentId,
    toolName: data.toolName,
    status: data.status || "PENDING",
    input: data.input || {},
    output: data.output || null,
    error: data.error || null,
    latencyMs: data.latencyMs || null,
    approvalRequestId: data.approvalRequestId || null,
    startedAt: new Date(),
    completedAt: data.completedAt || null,
  };
  mockStore.toolCallTraces.push(trace);
  return trace;
};

mockPrisma.toolCallTrace.findFirst = async (args: any) => {
  const where = args.where || {};
  return mockStore.toolCallTraces.find((t) => {
    if (where.id && t.id !== where.id) return false;
    if (where.organizationId && t.organizationId !== where.organizationId) return false;
    if (where.executionId && t.executionId !== where.executionId) return false;
    if (where.agentId && t.agentId !== where.agentId) return false;
    if (where.status && t.status !== where.status) return false;
    if (where.approvalRequestId && t.approvalRequestId !== where.approvalRequestId) return false;
    return true;
  }) || null;
};

mockPrisma.toolCallTrace.count = async (args: any) => {
  const where = args?.where || {};
  return mockStore.toolCallTraces.filter((t) => {
    if (where.executionId && t.executionId !== where.executionId) return false;
    if (where.organizationId && t.organizationId !== where.organizationId) return false;
    if (where.status && t.status !== where.status) return false;
    if (where.startedAt?.gte && t.startedAt < where.startedAt.gte) return false;
    return true;
  }).length;
};

mockPrisma.toolCallTrace.findMany = async (args: any) => {
  const where = args.where || {};
  let matches = mockStore.toolCallTraces.filter((t) => {
    if (where.executionId && t.executionId !== where.executionId) return false;
    if (where.organizationId && t.organizationId !== where.organizationId) return false;
    if (where.status && t.status !== where.status) return false;
    if (where.startedAt?.gte && t.startedAt < where.startedAt.gte) return false;
    return true;
  });
  if (args.orderBy) {
    const orderItem = Array.isArray(args.orderBy) ? args.orderBy[0] : args.orderBy;
    if (orderItem?.startedAt === "desc") {
      matches = matches.sort((a, b) => (b.startedAt?.getTime() ?? 0) - (a.startedAt?.getTime() ?? 0));
    } else if (orderItem?.startedAt === "asc") {
      matches = matches.sort((a, b) => (a.startedAt?.getTime() ?? 0) - (b.startedAt?.getTime() ?? 0));
    }
  }
  const skip = args.skip || 0;
  const take = args.take !== undefined ? args.take : matches.length;
  matches = matches.slice(skip, skip + take);

  if (args.include?.agent || args.include?.execution) {
    return matches.map((t) => {
      const agent = mockStore.agentIdentities.find((a) => a.id === t.agentId);
      const execution = mockStore.agentExecutions.find((e) => e.id === t.executionId);
      return {
        ...t,
        agent: agent ? { id: agent.id, name: agent.name } : null,
        execution: execution ? { id: execution.id, status: execution.status, objective: execution.objective } : null
      };
    });
  }

  return matches;
};

mockPrisma.toolCallTrace.update = async (args: any) => {
  const { where, data } = args;
  const trace = mockStore.toolCallTraces.find((t) => t.id === where.id);
  if (!trace) throw new Error("ToolCallTrace not found");
  if (data.status !== undefined) trace.status = data.status;
  if (data.output !== undefined) trace.output = data.output;
  if (data.error !== undefined) trace.error = data.error;
  if (data.latencyMs !== undefined) trace.latencyMs = data.latencyMs;
  if (data.completedAt !== undefined) trace.completedAt = data.completedAt;
  return trace;
};

mockPrisma.toolCallTrace.updateMany = async (args: any) => {
  const { where, data } = args;
  const matches = mockStore.toolCallTraces.filter((t) => {
    if (where.id && t.id !== where.id) return false;
    if (where.organizationId && t.organizationId !== where.organizationId) return false;
    if (where.approvalRequestId && t.approvalRequestId !== where.approvalRequestId) return false;
    if (where.status && t.status !== where.status) return false;
    return true;
  });
  for (const t of matches) {
    if (data.status !== undefined) t.status = data.status;
    if (data.output !== undefined) t.output = data.output;
    if (data.error !== undefined) t.error = data.error;
    if (data.latencyMs !== undefined) t.latencyMs = data.latencyMs;
    if (data.completedAt !== undefined) t.completedAt = data.completedAt;
  }
  return { count: matches.length };
};

// Audit log
mockPrisma.auditLog.create = async (args: any) => {
  const data = args.data;
  const log = {
    id: genId(),
    organizationId: data.organizationId,
    actorType: data.actorType,
    actorUserId: data.actorUserId || null,
    actorAgentId: data.actorAgentId || null,
    action: data.action,
    targetType: data.targetType,
    targetId: data.targetId || null,
    metadata: data.metadata || {},
    createdAt: new Date(),
  };
  mockStore.auditLogs.push(log);
  return log;
};

mockPrisma.auditLog.findMany = async (args: any) => {
  const where = args?.where || {};
  return mockStore.auditLogs
    .filter((log) => !where.organizationId || log.organizationId === where.organizationId)
    .slice(0, args?.take || 50);
};

// Feature Flags
mockPrisma.agentFeatureFlag.findUnique = async (args: any) => {
  const where = args.where?.organizationId_agentId_capability;
  if (!where) return null;
  return mockStore.featureFlags.find(
    (f) => f.organizationId === where.organizationId && f.agentId === where.agentId && f.capability === where.capability
  ) || null;
};

mockPrisma.agentFeatureFlag.findFirst = async (args: any) => {
  const where = args.where || {};
  return mockStore.featureFlags.find(
    (f) =>
      (!where.organizationId || f.organizationId === where.organizationId) &&
      (!where.capability || f.capability === where.capability) &&
      (where.agentId === undefined || f.agentId === where.agentId)
  ) || null;
};

mockPrisma.agentFeatureFlag.upsert = async (args: any) => {
  const { create, update } = args;
  let flag = mockStore.featureFlags.find(
    (f) => f.organizationId === create.organizationId && f.agentId === create.agentId && f.capability === create.capability
  );
  if (flag) {
    flag.state = update.state;
    flag.description = update.description;
    flag.updatedAt = new Date();
  } else {
    flag = {
      id: genId(),
      organizationId: create.organizationId,
      agentId: create.agentId,
      capability: create.capability,
      state: create.state,
      description: create.description || null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    mockStore.featureFlags.push(flag);
  }
  return flag;
};

mockPrisma.agentFeatureFlag.create = async (args: any) => {
  const data = args.data;
  const flag = {
    id: genId(),
    organizationId: data.organizationId,
    agentId: data.agentId || null,
    capability: data.capability,
    state: data.state || "DISABLED",
    description: data.description || null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  mockStore.featureFlags.push(flag);
  return flag;
};

mockPrisma.agentFeatureFlag.update = async (args: any) => {
  const { where, data } = args;
  const flag = mockStore.featureFlags.find((f) => f.id === where.id);
  if (!flag) throw new Error("Not found");
  if (data.state !== undefined) flag.state = data.state;
  if (data.description !== undefined) flag.description = data.description;
  flag.updatedAt = new Date();
  return flag;
};

mockPrisma.agentFeatureFlag.findMany = async (args: any) => {
  const where = args.where || {};
  const matches = mockStore.featureFlags.filter((f) => f.organizationId === where.organizationId);
  return matches.map(f => {
    const agent = mockStore.agentIdentities.find(a => a.id === f.agentId);
    return { ...f, agent: agent ? { id: agent.id, name: agent.name } : null };
  });
};

// Approval Gates
mockPrisma.approvalGate.findMany = async (args: any) => {
  const where = args.where || {};
  return mockStore.approvalGates.filter((g) => g.organizationId === where.organizationId);
};

mockPrisma.approvalGate.findUnique = async (args: any) => {
  const where = args.where?.organizationId_capability;
  if (!where) return null;
  return mockStore.approvalGates.find(
    (g) => g.organizationId === where.organizationId && g.capability === where.capability
  ) || null;
};

mockPrisma.approvalGate.upsert = async (args: any) => {
  const { create, update } = args;
  let gate = mockStore.approvalGates.find(
    (g) => g.organizationId === create.organizationId && g.capability === create.capability
  );
  if (gate) {
    gate.mode = update.mode;
    gate.reason = update.reason;
    gate.riskLevel = update.riskLevel !== undefined ? update.riskLevel : gate.riskLevel;
    gate.enabled = update.enabled !== undefined ? update.enabled : gate.enabled;
    gate.updatedAt = new Date();
  } else {
    gate = {
      id: genId(),
      organizationId: create.organizationId,
      capability: create.capability,
      mode: create.mode,
      reason: create.reason || null,
      riskLevel: create.riskLevel || 0,
      enabled: create.enabled !== undefined ? create.enabled : true,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    mockStore.approvalGates.push(gate);
  }
  return gate;
};

// Approval Requests
mockPrisma.approvalRequest.create = async (args: any) => {
  const data = args.data;
  const request = {
    id: genId(),
    organizationId: data.organizationId,
    agentId: data.agentId,
    requestedAction: data.requestedAction,
    reason: data.reason,
    payload: data.payload || {},
    status: data.status || "PENDING",
    expiresAt: data.expiresAt || null,
    reviewedByUserId: null,
    reviewedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  mockStore.approvalRequests.push(request);
  return request;
};

mockPrisma.approvalRequest.count = async (args: any) => {
  const where = args?.where || {};
  return mockStore.approvalRequests.filter((r) => {
    if (where.organizationId && r.organizationId !== where.organizationId) return false;
    if (where.status && r.status !== where.status) return false;
    return true;
  }).length;
};

mockPrisma.approvalRequest.findMany = async (args: any) => {
  const where = args.where || {};
  const matches = mockStore.approvalRequests.filter(
    (r) => r.organizationId === where.organizationId && (!where.status || r.status === where.status)
  );
  return matches.map((r) => {
    const agent = mockStore.agentIdentities.find((a) => a.id === r.agentId);
    const user = mockStore.users.find((u) => u.id === r.reviewedByUserId);
    return {
      ...r,
      agent: agent ? { id: agent.id, name: agent.name } : null,
      reviewedByUser: user ? { id: user.id, email: user.email, name: user.name } : null,
    };
  });
};

mockPrisma.approvalRequest.findFirst = async (args: any) => {
  const where = args.where || {};
  return mockStore.approvalRequests.find((r) => {
    if (where.id && r.id !== where.id) return false;
    if (where.organizationId && r.organizationId !== where.organizationId) return false;
    if (where.status && r.status !== where.status) return false;
    if (where.requestedAction && r.requestedAction !== where.requestedAction) return false;
    if (where.payload?.path && where.payload?.equals) {
      const [field] = where.payload.path;
      if (r.payload?.[field] !== where.payload.equals) return false;
    }
    return true;
  }) || null;
};

mockPrisma.approvalRequest.update = async (args: any) => {
  const { where, data } = args;
  const req = mockStore.approvalRequests.find((r) => r.id === where.id);
  if (!req) throw new Error("ApprovalRequest not found");
  if (data.status !== undefined) req.status = data.status;
  if (data.reviewedByUserId !== undefined) req.reviewedByUserId = data.reviewedByUserId;
  if (data.reviewedAt !== undefined) req.reviewedAt = data.reviewedAt;
  req.updatedAt = new Date();
  return req;
};

mockPrisma.approvalRequest.updateMany = async (args: any) => {
  const { where, data } = args;
  const matches = mockStore.approvalRequests.filter(
    (r) => (!where.id || r.id === where.id) && (!where.organizationId || r.organizationId === where.organizationId)
  );
  for (const match of matches) {
    if (data.status !== undefined) match.status = data.status;
    if (data.reviewedByUserId !== undefined) match.reviewedByUserId = data.reviewedByUserId;
    if (data.reviewedAt !== undefined) match.reviewedAt = data.reviewedAt;
    match.updatedAt = new Date();
  }
  return { count: matches.length };
};

// Idempotency Key
if (!mockPrisma.idempotencyKey) mockPrisma.idempotencyKey = {};
mockPrisma.idempotencyKey.findUnique = async (args: any) => {
  const where = args.where?.organizationId_key;
  if (!where) return null;
  return mockStore.idempotencyKeys.find(
    (k) => k.organizationId === where.organizationId && k.key === where.key
  ) || null;
};

mockPrisma.idempotencyKey.create = async (args: any) => {
  const data = args.data;
  const record = {
    id: genId(),
    organizationId: data.organizationId,
    key: data.key,
    requestHash: data.requestHash,
    route: data.route,
    actorType: data.actorType,
    actorUserId: data.actorUserId || null,
    actorAgentId: data.actorAgentId || null,
    responseStatus: data.responseStatus || 200,
    responseBody: data.responseBody || null,
    expiresAt: data.expiresAt || new Date(Date.now() + 86400000),
    createdAt: new Date(),
    updatedAt: new Date()
  };
  mockStore.idempotencyKeys.push(record);
  return record;
};

// Eval Cases
mockPrisma.evalCase.create = async (args: any) => {
  const data = args.data;
  const item = {
    id: genId(),
    organizationId: data.organizationId,
    taskContractId: data.taskContractId,
    name: data.name,
    input: data.input || {},
    expectedStatus: data.expectedStatus || null,
    expectedTools: data.expectedTools || [],
    successCriteria: data.successCriteria || null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  mockStore.evalCases.push(item);
  return item;
};

mockPrisma.evalCase.findMany = async (args: any) => {
  const where = args.where || {};
  return mockStore.evalCases.filter(
    (c) =>
      (!where.organizationId || c.organizationId === where.organizationId) &&
      (!where.taskContractId || c.taskContractId === where.taskContractId)
  );
};

mockPrisma.evalCase.findUnique = async (args: any) => {
  const where = args.where || {};
  return mockStore.evalCases.find((c) => c.id === where.id) || null;
};

mockPrisma.evalCase.findFirst = async (args: any) => {
  const where = args.where || {};
  const c = mockStore.evalCases.find(
    (c) =>
      (!where.id || c.id === where.id) &&
      (!where.organizationId || c.organizationId === where.organizationId)
  );
  if (!c) return null;
  const contract = mockStore.taskContracts.find((tc) => tc.id === c.taskContractId);
  return {
    ...c,
    taskContract: contract || null,
  };
};

// Eval Runs
mockPrisma.evalRun.create = async (args: any) => {
  const data = args.data;
  const item = {
    id: genId(),
    organizationId: data.organizationId,
    projectId: data.projectId,
    executionId: data.executionId || null,
    contractId: data.contractId || null,
    agentId: data.agentId || null,
    evalCaseId: data.evalCaseId || null,
    name: data.name,
    status: data.status || "QUEUED",
    score: data.score !== undefined ? data.score : null,
    threshold: data.threshold !== undefined ? data.threshold : 1,
    checks: data.checks || [],
    findings: data.findings || [],
    failureReason: data.failureReason || null,
    duration: data.duration !== undefined ? data.duration : null,
    startedAt: data.startedAt || new Date(),
    completedAt: data.completedAt || null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  mockStore.evalRuns.push(item);
  return item;
};

mockPrisma.evalRun.count = async (args: any) => {
  const where = args?.where || {};
  return mockStore.evalRuns.filter((er) => {
    if (where.organizationId && er.organizationId !== where.organizationId) return false;
    if (where.status && er.status !== where.status) return false;
    return true;
  }).length;
};

mockPrisma.evalRun.findMany = async (args: any) => {
  const where = args.where || {};
  const matches = mockStore.evalRuns.filter(
    (er) =>
      (!where.organizationId || er.organizationId === where.organizationId) &&
      (!where.projectId || er.projectId === where.projectId) &&
      (!where.executionId || er.executionId === where.executionId) &&
      (!where.evalCaseId || er.evalCaseId === where.evalCaseId) &&
      (!where.contractId || er.contractId === where.contractId)
  );
  return matches.map((er) => {
    const agent = mockStore.agentIdentities.find((a) => a.id === er.agentId);
    const contract = mockStore.taskContracts.find((c) => c.id === er.contractId);
    const execution = mockStore.agentExecutions.find((e) => e.id === er.executionId);
    return {
      ...er,
      agent: agent ? { id: agent.id, name: agent.name } : null,
      contract: contract ? { id: contract.id, name: contract.name, version: contract.version } : null,
      execution: execution ? { id: execution.id, status: execution.status, objective: execution.objective } : null,
    };
  });
};

mockPrisma.organization = {
  findUnique: async (args: any) => {
    const where = args.where || {};
    return mockStore.organizations.find((o) => o.id === where.id) || null;
  },
  findFirst: async (args: any) => {
    const where = args.where || {};
    return mockStore.organizations.find((o) => !where.id || o.id === where.id) || null;
  }
};

mockPrisma.organizationMember = {
  findFirst: async (args: any) => {
    const where = args.where || {};
    return mockStore.memberships.find(
      (m) => m.userId === where.userId && m.organizationId === where.organizationId
    ) || null;
  }
};

mockPrisma.apiKey = {
  create: async (args: any) => {
    const data = args.data;
    const item = {
      id: Math.random().toString(36).substring(2, 15),
      organizationId: data.organizationId,
      agentId: data.agentId,
      name: data.name,
      keyPrefix: data.keyPrefix,
      keyHash: data.keyHash,
      scopes: data.scopes || [],
      expiresAt: data.expiresAt || null,
      lastUsedAt: null,
      revokedAt: null,
      createdAt: new Date(),
      updatedAt: new Date()
    };
    mockStore.apiKeys.push(item);
    return item;
  },
  findFirst: async (args: any) => {
    const where = args.where || {};
    return mockStore.apiKeys.find((k) => {
      if (where.keyHash && k.keyHash !== where.keyHash) return false;
      if (where.id && k.id !== where.id) return false;
      if (where.organizationId && k.organizationId !== where.organizationId) return false;
      if (where.revokedAt === null && k.revokedAt != null) return false;
      return true;
    }) || null;
  },
  findMany: async (args: any) => {
    const where = args.where || {};
    const select = args.select;
    const matches = mockStore.apiKeys.filter((k) => {
      if (where.organizationId && k.organizationId !== where.organizationId) return false;
      return true;
    });

    if (select) {
      return matches.map((k) => {
        const res: any = {};
        for (const key of Object.keys(select)) {
          if (select[key]) {
            res[key] = k[key];
          }
        }
        return res;
      });
    }

    return matches;
  },
  update: async (args: any) => {
    const where = args.where || {};
    const data = args.data || {};
    const item = mockStore.apiKeys.find((k) => k.id === where.id);
    if (!item) throw new Error("Key not found");
    if (data.revokedAt !== undefined) item.revokedAt = data.revokedAt;
    if (data.lastUsedAt !== undefined) item.lastUsedAt = data.lastUsedAt;
    item.updatedAt = new Date();
    return item;
  }
};

mockPrisma.mcpServerRegistration = {
  findMany: async (args: any) => {
    const where = args?.where || {};
    return (mockStore.mcpServerRegistrations || []).filter(
      (m) => !where.organizationId || m.organizationId === where.organizationId
    );
  }
};
