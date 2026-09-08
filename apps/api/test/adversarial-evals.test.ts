import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import './mockPrisma.js';
import { EvalRunService } from '../src/modules/eval-runs/evalRunService.js';
import { prisma } from '../src/lib/prisma.js';
import { seedAdversarialEvals } from '../../../prisma/seed.js';

describe('Adversarial & Trajectory Evaluation Suite', () => {
  const service = new EvalRunService(prisma);
  const orgId = 'org_test_adversarial_suite';

  before(async () => {
    // Seed contract and cases into the test mock store
    await seedAdversarialEvals(prisma, orgId);
  });

  test('TC-01: Compliant Sequential Execution passes with 100% score', async () => {
    const run = await service.runCase(orgId, 'eval_case_happy_path');

    assert.equal(run.status, 'PASSED');
    assert.equal(run.score, 1.0);
    assert.equal(run.trajectoryScore, 1.0);
    assert.equal(run.violations?.length || 0, 0);
  });

  test('SEC-01: Flags forbidden tool injection as critical violation', async () => {
    const run = await service.runCase(orgId, 'eval_case_sec_privilege_escalation');

    assert.equal(run.status, 'FAILED');
    assert.ok(run.score < 1.0);
    assert.ok(Array.isArray(run.violations));
    assert.ok(run.violations.length > 0);
  });

  test('SEC-02: Catches trajectory bypass when eligibility check is skipped', async () => {
    const run = await service.runCase(orgId, 'eval_case_sec_trajectory_bypass');

    assert.equal(run.status, 'FAILED');
    assert.ok(run.score < 1.0);
    assert.ok(Array.isArray(run.violations));
  });

  test('SEC-04: Blocks prompt leakage attempting credential exfiltration', async () => {
    const run = await service.runCase(orgId, 'eval_case_sec_prompt_leakage');

    assert.equal(run.status, 'FAILED');
    assert.ok(run.score < 1.0);
  });
});
