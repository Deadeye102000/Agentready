import { test, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { evaluateTrajectoryTraces } from "../src/evaluator.js";
import { TrajectoryPolicy } from "../src/schemas/trajectory.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const localFixturePath = path.resolve(__dirname, "./fixtures/trajectory_eval_cases.json");
const externalFixturePath = path.resolve(
  __dirname,
  "../../../../agentready-governance-sdk/tests/fixtures/trajectory_eval_cases.json"
);
const fixturePath = fs.existsSync(localFixturePath) ? localFixturePath : externalFixturePath;

describe("Trajectory Evaluator Engine", () => {
  const policy: TrajectoryPolicy = {
    mode: "STRICT_SEQUENCE",
    expectedSteps: [
      { tool: "get_transaction", required: true },
      { tool: "issue_refund", required: true, expectedGateStatus: "REQUIRE_APPROVAL" },
    ],
    forbiddenTools: ["delete_account"],
    maxToolCalls: 5,
  };

  test("passes on perfect strict sequential trajectory", () => {
    const traces = [
      { toolName: "get_transaction", inputPayload: { id: "TX1" } },
      { toolName: "issue_refund", inputPayload: { id: "TX1", amount: 500 }, gateStatus: "REQUIRE_APPROVAL" },
    ];
    const result = evaluateTrajectoryTraces(traces, policy);
    assert.equal(result.passed, true);
    assert.equal(result.score, 1.0);
    assert.equal(result.violations.length, 0);
  });

  test("fails and flags violation when forbidden tool is called", () => {
    const traces = [
      { toolName: "get_transaction", inputPayload: { id: "TX1" } },
      { toolName: "delete_account", inputPayload: { id: "USR1" } },
    ];
    const result = evaluateTrajectoryTraces(traces, policy);
    assert.equal(result.passed, false);
    assert.ok(result.violations.some((v) => v.includes('Forbidden tool executed: "delete_account"')));
  });

  describe("Shared Cross-Language Fixtures (trajectory_eval_cases.json)", () => {
    const cases = JSON.parse(fs.readFileSync(fixturePath, "utf8"));

    for (const c of cases) {
      test(`[fixture] ${c.id}: ${c.description}`, () => {
        const result = evaluateTrajectoryTraces(c.traces, c.policy);
        assert.equal(
          result.passed,
          c.expected.passed,
          `[${c.id}] passed mismatch: got ${result.passed}, want ${c.expected.passed}`
        );
        assert.equal(
          result.score,
          c.expected.score,
          `[${c.id}] score mismatch: got ${result.score}, want ${c.expected.score}`
        );
        assert.equal(
          result.matchedSteps,
          c.expected.matched_steps,
          `[${c.id}] matchedSteps mismatch: got ${result.matchedSteps}, want ${c.expected.matched_steps}`
        );
        assert.equal(
          result.totalExpected,
          c.expected.total_expected,
          `[${c.id}] totalExpected mismatch: got ${result.totalExpected}, want ${c.expected.total_expected}`
        );
        assert.deepEqual(
          result.violations,
          c.expected.violations,
          `[${c.id}] violations mismatch`
        );
      });
    }
  });
});
