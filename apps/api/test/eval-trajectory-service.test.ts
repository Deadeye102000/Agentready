import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import './mockPrisma.js';
import { EvalRunService } from '../src/modules/eval-runs/evalRunService.js';
import { prisma } from '../src/lib/prisma.js';

describe('EvalRunService - Trajectory Scoring Integration', () => {
  const service = new EvalRunService(prisma);
  const orgId = 'org-traj-test';

  test('scores 1.0 when executed tools satisfy contract trajectory policy', async () => {
    // 1. Seed contract with trajectory policy
    const contract = await prisma.taskContract.create({
      data: {
        organizationId: orgId,
        name: 'Refund Contract with Policy',
        allowedTools: ['get_transaction', 'issue_refund'],
        successCriteria: ['Refund completed safely'],
        trajectoryPolicy: {
          mode: 'STRICT_SEQUENCE',
          expectedSteps: [
            { tool: 'get_transaction', required: true },
            { tool: 'issue_refund', required: true },
          ],
        },
      } as any,
    });

    // 2. Seed eval case
    const evalCase = await prisma.evalCase.create({
      data: {
        organizationId: orgId,
        taskContractId: contract.id,
        name: 'Happy path refund sequence',
        input: {},
        expectedStatus: 'SUCCEEDED',
        expectedTools: ['get_transaction', 'issue_refund'],
      },
    });

    // 3. Run case
    const run = await service.runCase(orgId, evalCase.id);

    assert.equal(run.status, 'PASSED');
    assert.equal(run.score, 1.0);
    assert.equal(run.trajectoryScore, 1.0);
    assert.deepEqual(run.violations, []);
  });

  test('penalizes score and records violations when sequence is violated', async () => {
    // 1. Contract requiring a 2-step sequence
    const contract = await prisma.taskContract.create({
      data: {
        organizationId: orgId,
        name: 'Strict Verification Contract',
        allowedTools: ['verify_user', 'issue_refund'],
        successCriteria: ['Must verify before refund'],
        trajectoryPolicy: {
          mode: 'STRICT_SEQUENCE',
          expectedSteps: [
            { tool: 'verify_user', required: true },
            { tool: 'issue_refund', required: true },
          ],
        },
      } as any,
    });

    // 2. Eval case simulating missing verify_user step
    const evalCase = await prisma.evalCase.create({
      data: {
        organizationId: orgId,
        taskContractId: contract.id,
        name: 'Simulated failure case',
        input: { simulateFailure: true },
        expectedStatus: 'SUCCEEDED',
        expectedTools: ['verify_user', 'issue_refund'],
      },
    });

    const run = await service.runCase(orgId, evalCase.id);

    assert.equal(run.status, 'FAILED');
    assert.ok((run.score ?? 0) < 1.0);
    assert.ok(Array.isArray(run.violations));
    assert.ok(((run.violations as string[]) || []).length > 0);
  });
});
