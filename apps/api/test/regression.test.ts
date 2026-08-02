import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { buildServer } from "../src/server.js";
import { mockStore, resetMockStore } from "./mockPrisma.js";
import { signSession } from "@agentready/auth";
import { env } from "../src/lib/env.js";

describe("Evaluation Regression Integration Tests", () => {
  let app: any;
  let cookieA: string;

  beforeEach(async () => {
    resetMockStore();
    app = await buildServer();

    // Seed organization, user, membership, project, agent, contract
    const org = { id: "org-1", name: "Test Org", slug: "test-org", createdAt: new Date(), updatedAt: new Date() };
    mockStore.organizations.push(org);

    const user = { id: "user-1", email: "user@example.com", name: "User 1", passwordHash: "hash", createdAt: new Date(), updatedAt: new Date() };
    mockStore.users.push(user);

    mockStore.memberships.push({
      id: "mem-1",
      userId: "user-1",
      organizationId: "org-1",
      role: "OWNER",
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const agent = { id: "agent-1", organizationId: "org-1", name: "Test Agent", createdAt: new Date(), updatedAt: new Date() };
    mockStore.agentIdentities.push(agent);

    const project = { id: "proj-1", organizationId: "org-1", name: "Project 1", status: "ACTIVE", createdAt: new Date(), updatedAt: new Date() };
    mockStore.projects.push(project);

    const contract = {
      id: "contract-1",
      organizationId: "org-1",
      projectId: "proj-1",
      agentId: "agent-1",
      name: "File Ops Contract",
      version: 1,
      objective: "File operations",
      inputs: {},
      successCriteria: [],
      allowedTools: ["file_write"],
      requiredApprovals: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    mockStore.taskContracts.push(contract);

    const token = signSession(
      { userId: "user-1", organizationId: "org-1", exp: Math.floor(Date.now() / 1000) + 3600 },
      env.AUTH_SESSION_SECRET
    );
    cookieA = `agentready_session=${token}`;
  });

  it("calculates evaluation regression metrics (score, deltas, pass rates, newly passing/failing)", async () => {
    // 1. Seed two evaluation cases
    const caseA = {
      id: "case-a",
      organizationId: "org-1",
      taskContractId: "contract-1",
      name: "Verify Case A",
      input: {},
      expectedStatus: "SUCCEEDED",
      expectedTools: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const caseB = {
      id: "case-b",
      organizationId: "org-1",
      taskContractId: "contract-1",
      name: "Verify Case B",
      input: {},
      expectedStatus: "SUCCEEDED",
      expectedTools: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    mockStore.evalCases.push(caseA, caseB);

    const now = Date.now();

    // 2. Cycle 1 (Previous batch): Case A failed, Case B passed
    const prevRunA = {
      id: "run-prev-a",
      organizationId: "org-1",
      projectId: "proj-1",
      contractId: "contract-1",
      evalCaseId: "case-a",
      name: "Run prev A",
      status: "FAILED",
      score: 0.5,
      threshold: 1.0,
      createdAt: new Date(now - 10000), // 10s ago
      updatedAt: new Date(now - 10000),
    };
    const prevRunB = {
      id: "run-prev-b",
      organizationId: "org-1",
      projectId: "proj-1",
      contractId: "contract-1",
      evalCaseId: "case-b",
      name: "Run prev B",
      status: "PASSED",
      score: 1.0,
      threshold: 1.0,
      createdAt: new Date(now - 9000), // 9s ago
      updatedAt: new Date(now - 9000),
    };
    mockStore.evalRuns.push(prevRunA, prevRunB);

    // 3. Cycle 2 (Current batch): Case A passed (newly passing!), Case B failed (newly failing!)
    const currRunA = {
      id: "run-curr-a",
      organizationId: "org-1",
      projectId: "proj-1",
      contractId: "contract-1",
      evalCaseId: "case-a",
      name: "Run curr A",
      status: "PASSED",
      score: 1.0,
      threshold: 1.0,
      createdAt: new Date(now - 1000), // 1s ago
      updatedAt: new Date(now - 1000),
    };
    const currRunB = {
      id: "run-curr-b",
      organizationId: "org-1",
      projectId: "proj-1",
      contractId: "contract-1",
      evalCaseId: "case-b",
      name: "Run curr B",
      status: "FAILED",
      score: 0.5,
      threshold: 1.0,
      createdAt: new Date(now), // now
      updatedAt: new Date(now),
    };
    mockStore.evalRuns.push(currRunA, currRunB);

    // 4. Request regression report
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/eval-runs/regression",
      headers: { cookie: cookieA },
    });

    assert.equal(res.statusCode, 200);
    const body = JSON.parse(res.body);

    // Previous average: (0.5 + 1.0) / 2 = 0.75
    assert.equal(body.previousScore, 0.75);
    // Current average: (1.0 + 0.5) / 2 = 0.75
    assert.equal(body.currentScore, 0.75);
    assert.equal(body.delta, 0.0);

    // Pass rate comparisons:
    // Cycle 1: 1 out of 2 passed = 50%
    assert.equal(body.previousPassRate, 0.5);
    // Cycle 2: 1 out of 2 passed = 50%
    assert.equal(body.currentPassRate, 0.5);
    assert.equal(body.passRateChange, 0.0);

    // Regression indicators
    assert.equal(body.newlyPassing.length, 1);
    assert.equal(body.newlyPassing[0].id, "case-a");
    assert.equal(body.newlyPassing[0].name, "Verify Case A");

    assert.equal(body.newlyFailing.length, 1);
    assert.equal(body.newlyFailing[0].id, "case-b");
    assert.equal(body.newlyFailing[0].name, "Verify Case B");
  });
});
