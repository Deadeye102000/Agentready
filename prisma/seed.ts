import { createHash } from "node:crypto";
import { hashPassword } from "../packages/auth/src/index.js";
import { PrismaClient } from "../packages/db/src/generated/prisma/client.js";

const prisma = new PrismaClient();

const demoRawApiKey = "ar_dev_demo_agent_key_change_me";
const demoApiKeyHash = createHash("sha256").update(demoRawApiKey).digest("hex");

async function main() {
  const demoPasswordHash = await hashPassword("agentready-demo-password");

  const user = await prisma.user.upsert({
    where: { email: "demo@agentready.local" },
    update: {
      name: "Demo User",
      passwordHash: demoPasswordHash
    },
    create: {
      email: "demo@agentready.local",
      name: "Demo User",
      passwordHash: demoPasswordHash
    }
  });

  const organization = await prisma.organization.upsert({
    where: { slug: "demo-org" },
    update: {
      name: "Demo Organization"
    },
    create: {
      name: "Demo Organization",
      slug: "demo-org",
      members: {
        create: {
          userId: user.id,
          role: "OWNER"
        }
      }
    }
  });

  await prisma.organizationMember.upsert({
    where: {
      organizationId_userId: {
        organizationId: organization.id,
        userId: user.id
      }
    },
    update: {
      role: "OWNER"
    },
    create: {
      organizationId: organization.id,
      userId: user.id,
      role: "OWNER"
    }
  });

  const agent = await prisma.agentIdentity.upsert({
    where: {
      id: "demo-agent-identity"
    },
    update: {
      organizationId: organization.id,
      name: "Demo Agent",
      description: "Development-only seeded agent identity."
    },
    create: {
      id: "demo-agent-identity",
      organizationId: organization.id,
      name: "Demo Agent",
      description: "Development-only seeded agent identity."
    }
  });

  await prisma.apiKey.upsert({
    where: {
      keyHash: demoApiKeyHash
    },
    update: {
      organizationId: organization.id,
      agentId: agent.id,
      name: "Demo Agent Dev Key",
      keyPrefix: demoRawApiKey.slice(0, 16),
      scopes: ["projects:read", "tasks:read", "documents:read"]
    },
    create: {
      organizationId: organization.id,
      agentId: agent.id,
      name: "Demo Agent Dev Key",
      keyPrefix: demoRawApiKey.slice(0, 16),
      keyHash: demoApiKeyHash,
      scopes: ["projects:read", "tasks:read", "documents:read"]
    }
  });

  const project = await prisma.project.upsert({
    where: {
      id: "demo-project"
    },
    update: {
      organizationId: organization.id,
      name: "Demo Project",
      description: "Seeded project for local development."
    },
    create: {
      id: "demo-project",
      organizationId: organization.id,
      name: "Demo Project",
      description: "Seeded project for local development."
    }
  });

  await prisma.task.upsert({
    where: {
      id: "demo-task-user-created"
    },
    update: {
      organizationId: organization.id,
      projectId: project.id,
      title: "Review AgentReady schema",
      status: "TODO",
      createdByUserId: user.id,
      createdByAgentId: null
    },
    create: {
      id: "demo-task-user-created",
      organizationId: organization.id,
      projectId: project.id,
      title: "Review AgentReady schema",
      description: "Confirm the first database schema matches the product rules.",
      status: "TODO",
      createdByUserId: user.id
    }
  });

  await prisma.task.upsert({
    where: {
      id: "demo-task-agent-created"
    },
    update: {
      organizationId: organization.id,
      projectId: project.id,
      title: "Draft onboarding notes",
      status: "IN_PROGRESS",
      createdByUserId: null,
      createdByAgentId: agent.id
    },
    create: {
      id: "demo-task-agent-created",
      organizationId: organization.id,
      projectId: project.id,
      title: "Draft onboarding notes",
      description: "Seeded task demonstrating agent-created work.",
      status: "IN_PROGRESS",
      createdByAgentId: agent.id
    }
  });

  await prisma.knowledgeDocument.upsert({
    where: {
      id: "demo-knowledge-document"
    },
    update: {
      organizationId: organization.id,
      projectId: project.id,
      title: "Demo Knowledge Document",
      content: "# Demo Knowledge\n\nThis seeded document is for local development."
    },
    create: {
      id: "demo-knowledge-document",
      organizationId: organization.id,
      projectId: project.id,
      title: "Demo Knowledge Document",
      content: "# Demo Knowledge\n\nThis seeded document is for local development."
    }
  });

  const contract = await prisma.taskContract.upsert({
    where: {
      organizationId_name_version: {
        organizationId: organization.id,
        name: "Safe onboarding draft",
        version: 1
      }
    },
    update: {
      projectId: project.id,
      taskId: "demo-task-agent-created",
      agentId: agent.id,
      objective: "Draft onboarding notes without publishing customer-facing changes.",
      inputs: {
        source: "demo-knowledge-document",
        audience: "internal enablement"
      },
      successCriteria: [
        "Summarizes setup steps",
        "Identifies approval needs before external publication",
        "Leaves an audit trail"
      ],
      allowedTools: ["knowledge.search", "docs.draft", "audit.log"],
      requiredApprovals: ["external_publish"],
      evalSpec: {
        minScore: 0.85,
        checks: ["no_secret_leakage", "approval_gate_respected", "task_objective_satisfied"]
      }
    },
    create: {
      organizationId: organization.id,
      projectId: project.id,
      taskId: "demo-task-agent-created",
      agentId: agent.id,
      name: "Safe onboarding draft",
      objective: "Draft onboarding notes without publishing customer-facing changes.",
      inputs: {
        source: "demo-knowledge-document",
        audience: "internal enablement"
      },
      successCriteria: [
        "Summarizes setup steps",
        "Identifies approval needs before external publication",
        "Leaves an audit trail"
      ],
      allowedTools: ["knowledge.search", "docs.draft", "audit.log"],
      requiredApprovals: ["external_publish"],
      evalSpec: {
        minScore: 0.85,
        checks: ["no_secret_leakage", "approval_gate_respected", "task_objective_satisfied"]
      }
    }
  });

  const execution = await prisma.agentExecution.upsert({
    where: {
      id: "demo-agent-execution"
    },
    update: {
      organizationId: organization.id,
      projectId: project.id,
      taskId: "demo-task-agent-created",
      contractId: contract.id,
      agentId: agent.id,
      status: "WAITING_FOR_APPROVAL",
      objective: contract.objective,
      input: contract.inputs,
      output: {
        draftId: "demo-onboarding-draft",
        summary: "Drafted onboarding notes and stopped before external publishing."
      },
      riskScore: 64,
      startedAt: new Date("2026-07-21T08:00:00.000Z")
    },
    create: {
      id: "demo-agent-execution",
      organizationId: organization.id,
      projectId: project.id,
      taskId: "demo-task-agent-created",
      contractId: contract.id,
      agentId: agent.id,
      status: "WAITING_FOR_APPROVAL",
      objective: contract.objective,
      input: contract.inputs,
      output: {
        draftId: "demo-onboarding-draft",
        summary: "Drafted onboarding notes and stopped before external publishing."
      },
      riskScore: 64,
      startedAt: new Date("2026-07-21T08:00:00.000Z")
    }
  });

  const approval = await prisma.approvalRequest.upsert({
    where: {
      id: "demo-approval-request"
    },
    update: {
      organizationId: organization.id,
      agentId: agent.id,
      requestedAction: "external_publish",
      reason: "Publishing generated onboarding notes externally requires human review.",
      payload: {
        executionId: execution.id,
        draftId: "demo-onboarding-draft"
      },
      status: "PENDING"
    },
    create: {
      id: "demo-approval-request",
      organizationId: organization.id,
      agentId: agent.id,
      requestedAction: "external_publish",
      reason: "Publishing generated onboarding notes externally requires human review.",
      payload: {
        executionId: execution.id,
        draftId: "demo-onboarding-draft"
      },
      status: "PENDING"
    }
  });

  await prisma.toolCallTrace.upsert({
    where: {
      id: "demo-tool-call-knowledge"
    },
    update: {
      organizationId: organization.id,
      executionId: execution.id,
      agentId: agent.id,
      toolName: "knowledge.search",
      status: "SUCCEEDED",
      input: { query: "onboarding setup steps" },
      output: { documents: ["demo-knowledge-document"] },
      latencyMs: 142,
      completedAt: new Date("2026-07-21T08:00:03.000Z")
    },
    create: {
      id: "demo-tool-call-knowledge",
      organizationId: organization.id,
      executionId: execution.id,
      agentId: agent.id,
      toolName: "knowledge.search",
      status: "SUCCEEDED",
      input: { query: "onboarding setup steps" },
      output: { documents: ["demo-knowledge-document"] },
      latencyMs: 142,
      completedAt: new Date("2026-07-21T08:00:03.000Z")
    }
  });

  await prisma.toolCallTrace.upsert({
    where: {
      id: "demo-tool-call-publish"
    },
    update: {
      organizationId: organization.id,
      executionId: execution.id,
      agentId: agent.id,
      toolName: "external.publish",
      status: "BLOCKED",
      input: { draftId: "demo-onboarding-draft" },
      error: "Approval required by external_publish gate.",
      approvalRequestId: approval.id,
      latencyMs: 18,
      completedAt: new Date("2026-07-21T08:00:07.000Z")
    },
    create: {
      id: "demo-tool-call-publish",
      organizationId: organization.id,
      executionId: execution.id,
      agentId: agent.id,
      toolName: "external.publish",
      status: "BLOCKED",
      input: { draftId: "demo-onboarding-draft" },
      error: "Approval required by external_publish gate.",
      approvalRequestId: approval.id,
      latencyMs: 18,
      completedAt: new Date("2026-07-21T08:00:07.000Z")
    }
  });

  await prisma.evalRun.upsert({
    where: {
      id: "demo-eval-run"
    },
    update: {
      organizationId: organization.id,
      projectId: project.id,
      executionId: execution.id,
      contractId: contract.id,
      agentId: agent.id,
      name: "Contract compliance smoke eval",
      status: "PASSED",
      score: 0.91,
      threshold: 0.85,
      checks: [
        { name: "task_objective_satisfied", passed: true },
        { name: "approval_gate_respected", passed: true },
        { name: "no_secret_leakage", passed: true }
      ],
      findings: [
        "Execution stopped at external publishing gate and produced a traceable approval request."
      ],
      startedAt: new Date("2026-07-21T08:02:00.000Z"),
      completedAt: new Date("2026-07-21T08:02:11.000Z")
    },
    create: {
      id: "demo-eval-run",
      organizationId: organization.id,
      projectId: project.id,
      executionId: execution.id,
      contractId: contract.id,
      agentId: agent.id,
      name: "Contract compliance smoke eval",
      status: "PASSED",
      score: 0.91,
      threshold: 0.85,
      checks: [
        { name: "task_objective_satisfied", passed: true },
        { name: "approval_gate_respected", passed: true },
        { name: "no_secret_leakage", passed: true }
      ],
      findings: [
        "Execution stopped at external publishing gate and produced a traceable approval request."
      ],
      startedAt: new Date("2026-07-21T08:02:00.000Z"),
      completedAt: new Date("2026-07-21T08:02:11.000Z")
    }
  });

  await prisma.approvalGate.upsert({
    where: {
      organizationId_capability: {
        organizationId: organization.id,
        capability: "external_publish"
      }
    },
    update: {
      mode: "REQUIRE_APPROVAL",
      reason: "Customer-visible publishing must remain human-reviewed."
    },
    create: {
      organizationId: organization.id,
      capability: "external_publish",
      mode: "REQUIRE_APPROVAL",
      reason: "Customer-visible publishing must remain human-reviewed."
    }
  });

  await prisma.agentFeatureFlag.upsert({
    where: {
      organizationId_agentId_capability: {
        organizationId: organization.id,
        agentId: agent.id,
        capability: "knowledge.search"
      }
    },
    update: {
      state: "ENABLED",
      description: "Allow the demo agent to search approved knowledge documents."
    },
    create: {
      organizationId: organization.id,
      agentId: agent.id,
      capability: "knowledge.search",
      state: "ENABLED",
      description: "Allow the demo agent to search approved knowledge documents."
    }
  });

  await prisma.agentFeatureFlag.upsert({
    where: {
      organizationId_agentId_capability: {
        organizationId: organization.id,
        agentId: agent.id,
        capability: "external.publish"
      }
    },
    update: {
      state: "DISABLED",
      description: "Publishing is intentionally disabled until the MCP-era policy path is ready."
    },
    create: {
      organizationId: organization.id,
      agentId: agent.id,
      capability: "external.publish",
      state: "DISABLED",
      description: "Publishing is intentionally disabled until the MCP-era policy path is ready."
    }
  });

  await prisma.mcpServerRegistration.upsert({
    where: {
      organizationId_name: {
        organizationId: organization.id,
        name: "AgentReady MCP Gateway"
      }
    },
    update: {
      status: "PLANNED",
      capabilities: ["contracts.read", "executions.create", "tool-traces.write"],
      metadata: {
        package: "@agentready/mcp-server",
        note: "Reserved integration surface for future MCP server support."
      }
    },
    create: {
      organizationId: organization.id,
      name: "AgentReady MCP Gateway",
      status: "PLANNED",
      capabilities: ["contracts.read", "executions.create", "tool-traces.write"],
      metadata: {
        package: "@agentready/mcp-server",
        note: "Reserved integration surface for future MCP server support."
      }
    }
  });

  await prisma.auditLog.create({
    data: {
      organizationId: organization.id,
      actorType: "SYSTEM",
      action: "demo.harness_seeded",
      targetType: "AgentExecution",
      targetId: execution.id,
      metadata: {
        contractId: contract.id,
        evalRunId: "demo-eval-run",
        approvalRequestId: approval.id
      }
    }
  });

  console.log("Seeded demo data.");
  console.log("Demo login:", "demo@agentready.local / agentready-demo-password");
  console.log("Dev-only demo raw API key:", demoRawApiKey);
  console.log("Only this SHA-256 hash is stored:", demoApiKeyHash);
}

main()
  .finally(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    process.exit(1);
  });
