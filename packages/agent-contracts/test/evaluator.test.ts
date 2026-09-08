import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { evaluateTrajectoryTraces } from '../src/evaluator.js';
import { TrajectoryPolicy } from '../src/schemas/trajectory.js';

describe('Trajectory Evaluator Engine', () => {
  const policy: TrajectoryPolicy = {
    mode: 'STRICT_SEQUENCE',
    expectedSteps: [
      { tool: 'get_transaction', required: true },
      { tool: 'issue_refund', required: true, expectedGateStatus: 'REQUIRE_APPROVAL' },
    ],
    forbiddenTools: ['delete_account'],
    maxToolCalls: 5,
  };

  test('passes on perfect strict sequential trajectory', () => {
    const traces = [
      { toolName: 'get_transaction', inputPayload: { id: 'TX1' } },
      { toolName: 'issue_refund', inputPayload: { id: 'TX1', amount: 500 }, gateStatus: 'REQUIRE_APPROVAL' },
    ];
    const result = evaluateTrajectoryTraces(traces, policy);
    assert.equal(result.passed, true);
    assert.equal(result.score, 1.0);
    assert.equal(result.violations.length, 0);
  });

  test('fails and flags violation when forbidden tool is called', () => {
    const traces = [
      { toolName: 'get_transaction', inputPayload: { id: 'TX1' } },
      { toolName: 'delete_account', inputPayload: { id: 'USR1' } },
    ];
    const result = evaluateTrajectoryTraces(traces, policy);
    assert.equal(result.passed, false);
    assert.ok(result.violations.some((v) => v.includes('Forbidden tool executed: "delete_account"')));
  });
});
